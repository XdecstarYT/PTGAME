import {
  STARTING_BUDGET, BASE_FARE, STATION_MAINTENANCE_PER_DAY, DEFAULT_REGULATION_ID,
  SUBSIDY_PER_RIDER, COMBUSTION_POWERTRAINS,
} from './config.js';
import { TimeSystem } from './time.js';
import { computeStationShopRevenue } from './stations/stationStatEngine.js';

// Budget, fares, operating costs and the finance dashboard's data feed.
// Kept independent of rendering/network so it's easy to reason about.

const ACCESSIBILITY_BONUS_PER_PERSON = 0.15; // $/day per resident+job served within a station's catchment
const ACCESSIBILITY_BONUS_CAP_PER_STATION = 400; // $/day - keeps one mega-hub from dominating income

export class Economy {
  constructor() {
    this.budget = STARTING_BUDGET;
    this.debt = 0;
    this.fare = BASE_FARE;
    this.activeRegulationId = DEFAULT_REGULATION_ID;
    this.congestion = 0; // citywide road congestion, 0-100 - see passengers.js/network.js

    // temporary multipliers events.js flips during disruptions/economic shocks
    this.weatherSpeedMultiplier = 1;  // surface (non-subway) speed during storms
    this.fuelPriceMultiplier = 1;     // running cost for combustion powertrains, on top of baseFuelIndex
    this.subsidyMultiplier = 1;       // government top-up per rider

    // Player-adjustable "surge pricing" strength (0..1, default off) - see
    // earnFare()'s fareMultiplier param. 0 keeps fares perfectly flat
    // (identical to pre-existing behavior); 1 fully tracks
    // TimeSystem.demandMultiplier's peak/off-peak curve.
    this.peakPricingStrength = 0;

    // A slow-drifting fuel market index (separate from events.js's sudden
    // fuel_spike shocks) so combustion running costs feel like a live market
    // instead of sitting flat at 1x between rare disruption events.
    this.baseFuelIndex = 1;
    this._fuelDrift = 0;

    // Ambient day-to-day weather/season - distinct from events.js's rarer,
    // more severe weather_slow/weather_bridge disruptions. Drives the rain
    // particles/audio layer and a small passenger mode-choice nudge.
    this.season = TimeSystem.seasonForDay(1);
    this.isRaining = false;

    this.dailyIncome = 0;
    this.dailyExpense = 0;
    this.dailyRidership = 0;
    this.lostDemandToday = 0;
    this.carTripsToday = 0;
    this.dailyFreightRevenue = 0;
    this.dailyShopRevenue = 0;
    this.dailyAccessibilityBonus = 0;
    this.dailyTouristTrips = 0;

    this.totalRevenue = 0;
    this.totalExpense = 0;
    this.totalRidership = 0;
    this.totalFreightRevenue = 0;
    this.totalShopRevenue = 0;
    this.totalAccessibilityBonus = 0;
    this.totalTouristTrips = 0;

    this.routeStats = new Map(); // routeId -> {revenueToday, costToday, revenueTotal, costTotal, ridersToday, ridersTotal}
    this.history = []; // per-day snapshots for the finance dashboard chart
  }

  _routeEntry(routeId) {
    if (!this.routeStats.has(routeId)) {
      this.routeStats.set(routeId, {
        revenueToday: 0, costToday: 0, revenueTotal: 0, costTotal: 0,
        ridersToday: 0, ridersTotal: 0,
      });
    }
    return this.routeStats.get(routeId);
  }

  canAfford(amount) { return this.budget >= amount; }

  spend(amount, routeId = null) {
    this.budget -= amount;
    this.dailyExpense += amount;
    this.totalExpense += amount;
    if (routeId) {
      const r = this._routeEntry(routeId);
      r.costToday += amount;
      r.costTotal += amount;
    }
  }

  // Called once per *completed trip* (not per leg). Revenue is split evenly
  // across every route the passenger actually rode. fareMultiplier (default
  // 1, i.e. identical to the old flat-fare behavior) lets callers apply
  // surge pricing and/or a tourist premium - see passengers.js's
  // _completeTrip(), which computes it from peakPricingStrength and
  // passenger.isTourist.
  earnFare(routeIds, fareMultiplier = 1) {
    const amount = this.fare * fareMultiplier + SUBSIDY_PER_RIDER * this.subsidyMultiplier;
    this.budget += amount;
    this.dailyIncome += amount;
    this.totalRevenue += amount;
    this.dailyRidership += 1;
    this.totalRidership += 1;
    const unique = [...new Set(routeIds)];
    if (unique.length) {
      const share = amount / unique.length;
      for (const id of unique) {
        const r = this._routeEntry(id);
        r.revenueToday += share;
        r.revenueTotal += share;
      }
    }
    return amount;
  }

  // Called once per delivered freight shipment (see cargo.js).
  earnFreight(amount) {
    this.budget += amount;
    this.dailyIncome += amount;
    this.totalRevenue += amount;
    this.dailyFreightRevenue += amount;
    this.totalFreightRevenue += amount;
    return amount;
  }

  // Called once per boarding (leg), independent of fare - drives per-route ridership stats.
  recordBoarding(routeId) {
    const r = this._routeEntry(routeId);
    r.ridersToday += 1;
    r.ridersTotal += 1;
  }

  recordLostDemand() { this.lostDemandToday += 1; }
  recordCarTrip() { this.carTripsToday += 1; }
  recordTouristTrip() { this.dailyTouristTrips += 1; this.totalTouristTrips += 1; }

  takeLoan(amount) {
    this.budget += amount;
    this.debt += amount;
  }

  repayDebt(amount) {
    const pay = Math.min(amount, this.debt, Math.max(0, this.budget));
    this.debt -= pay;
    this.budget -= pay;
    return pay;
  }

  removeRouteStats(routeId) { this.routeStats.delete(routeId); }

  // called once per elapsed sim-day. vehicleSystem is optional (older
  // callers/tests can omit it) - without it, running costs just skip the
  // wear surcharge below rather than throwing.
  applyDailyCosts(network, vehicleSystem = null) {
    for (const route of network.routes.values()) {
      if (!route.committed || !route.vehicleStats) continue;
      let cost = route.vehicleStats.runningCostPerDay * route.frequency;
      const model = network.catalog?.get(route.modelId);
      if (model && COMBUSTION_POWERTRAINS.includes(model.powertrainId)) cost *= this.baseFuelIndex * this.fuelPriceMultiplier;
      // A worn, aging fleet costs more to keep running - the same
      // wear-vs-reliability tradeoff vehicles.js already models for speed,
      // applied here to daily upkeep so refurbishing/replacing old vehicles
      // is a real cost decision, not just a speed/comfort one.
      if (vehicleSystem) {
        const fleet = route.vehicleIds.map(id => vehicleSystem.vehicles.get(id)).filter(Boolean);
        if (fleet.length) {
          const avgWear = fleet.reduce((sum, v) => sum + v.wearFactor, 0) / fleet.length;
          cost *= 1 + avgWear * 0.4;
        }
      }
      this.spend(cost, route.id);

      if (route.vehicleStats.adRevenuePerDay) {
        const adIncome = route.vehicleStats.adRevenuePerDay * route.frequency;
        this.budget += adIncome;
        this.dailyIncome += adIncome;
        this.totalRevenue += adIncome;
        const r = this._routeEntry(route.id);
        r.revenueToday += adIncome;
        r.revenueTotal += adIncome;
      }
    }
    const stationCost = network.stations.size * STATION_MAINTENANCE_PER_DAY;
    if (stationCost > 0) this.spend(stationCost);

    // Passive shop income for designed stations - see stationStatEngine.js's
    // computeStationShopRevenue(). Legacy/undesigned stations (no .design)
    // have no shops to earn from, so they're skipped entirely.
    for (const station of network.stations.values()) {
      if (!station.design) continue;
      const revenue = computeStationShopRevenue(station.design, station.designStats);
      if (revenue <= 0) continue;
      this.budget += revenue;
      this.dailyIncome += revenue;
      this.totalRevenue += revenue;
      this.dailyShopRevenue += revenue;
      this.totalShopRevenue += revenue;
    }

    // Council transit-accessibility bonus: a real subsidy for serving dense
    // areas, on top of fare revenue - rewards station PLACEMENT directly
    // (unlike fares, which only pay out once someone actually rides). Reuses
    // the same catchment-radius-vs-demand-zone-tile pattern
    // network.coveragePercent() already uses, just summing population/jobs
    // served instead of counting tiles as covered/not.
    if (network.city?.demandZones) {
      const { residential, jobsZones } = network.city.demandZones();
      for (const station of network.stations.values()) {
        let served = 0;
        for (const tile of residential) {
          const d = Math.hypot(station.worldX - tile.worldX, station.worldZ - tile.worldZ);
          if (d <= station.radius) served += network.city.effectivePopulation(tile);
        }
        for (const tile of jobsZones) {
          const d = Math.hypot(station.worldX - tile.worldX, station.worldZ - tile.worldZ);
          if (d <= station.radius) served += network.city.effectiveJobs(tile);
        }
        const bonus = Math.min(ACCESSIBILITY_BONUS_CAP_PER_STATION, served * ACCESSIBILITY_BONUS_PER_PERSON);
        if (bonus <= 0) continue;
        this.budget += bonus;
        this.dailyIncome += bonus;
        this.totalRevenue += bonus;
        this.dailyAccessibilityBonus += bonus;
        this.totalAccessibilityBonus += bonus;
      }
    }
  }

  applyWeeklyInterest() {
    if (this.debt > 0) {
      const interest = this.debt * 0.04;
      this.debt += interest;
    }
  }

  routeProfitToday(routeId) {
    const r = this.routeStats.get(routeId);
    if (!r) return 0;
    return r.revenueToday - r.costToday;
  }

  // Feedback loop: congested roads slow surface transit down, which pushes
  // more riders into cars, which raises congestion further. Subway ignores
  // this entirely (grade-separated).
  congestionSpeedMultiplier(category) {
    if (category === 'subway') return 1;
    return 1 - (this.congestion / 100) * 0.5;
  }

  // Advances the slow-drifting fuel market index and rolls the day's ambient
  // season/weather - called once per elapsed sim-day, for the day that's
  // STARTING (not the one that just ended via closeDay), so the new
  // index/weather takes effect from the start of that day. Separate from
  // events.js's rarer, more severe weather_slow/fuel_spike disruptions,
  // which still apply on top of this as temporary multipliers.
  advanceDailyMarket(day) {
    const wave = Math.sin(day / 30) * 0.08;
    this._fuelDrift = Math.max(-0.15, Math.min(0.15, this._fuelDrift + (Math.random() - 0.5) * 0.02));
    this.baseFuelIndex = Math.max(0.75, Math.min(1.35, 1 + wave + this._fuelDrift));

    this.season = TimeSystem.seasonForDay(day);
    const rainChance = { Spring: 0.35, Summer: 0.15, Autumn: 0.4, Winter: 0.3 }[this.season] ?? 0.25;
    this.isRaining = Math.random() < rainChance;
  }

  closeDay(day, satisfaction, coverage) {
    this.history.push({
      day,
      income: this.dailyIncome,
      expense: this.dailyExpense,
      profit: this.dailyIncome - this.dailyExpense,
      ridership: this.dailyRidership,
      lostDemand: this.lostDemandToday,
      carTrips: this.carTripsToday,
      satisfaction,
      coverage,
      budget: this.budget,
      freightRevenue: this.dailyFreightRevenue,
      shopRevenue: this.dailyShopRevenue,
      accessibilityBonus: this.dailyAccessibilityBonus,
      touristTrips: this.dailyTouristTrips,
    });
    if (this.history.length > 120) this.history.shift();
    for (const r of this.routeStats.values()) { r.revenueToday = 0; r.costToday = 0; r.ridersToday = 0; }
    this.dailyIncome = 0;
    this.dailyExpense = 0;
    this.dailyRidership = 0;
    this.lostDemandToday = 0;
    this.carTripsToday = 0;
    this.dailyFreightRevenue = 0;
    this.dailyShopRevenue = 0;
    this.dailyAccessibilityBonus = 0;
    this.dailyTouristTrips = 0;
  }

  // ---------------- save/load ----------------

  serialize() {
    return {
      budget: this.budget, debt: this.debt, fare: this.fare,
      activeRegulationId: this.activeRegulationId, congestion: this.congestion,
      weatherSpeedMultiplier: this.weatherSpeedMultiplier,
      fuelPriceMultiplier: this.fuelPriceMultiplier, subsidyMultiplier: this.subsidyMultiplier,
      peakPricingStrength: this.peakPricingStrength,
      baseFuelIndex: this.baseFuelIndex, _fuelDrift: this._fuelDrift,
      season: this.season, isRaining: this.isRaining,
      dailyIncome: this.dailyIncome, dailyExpense: this.dailyExpense, dailyRidership: this.dailyRidership,
      lostDemandToday: this.lostDemandToday, carTripsToday: this.carTripsToday,
      dailyFreightRevenue: this.dailyFreightRevenue, totalFreightRevenue: this.totalFreightRevenue,
      dailyShopRevenue: this.dailyShopRevenue, totalShopRevenue: this.totalShopRevenue,
      dailyAccessibilityBonus: this.dailyAccessibilityBonus, totalAccessibilityBonus: this.totalAccessibilityBonus,
      dailyTouristTrips: this.dailyTouristTrips, totalTouristTrips: this.totalTouristTrips,
      totalRevenue: this.totalRevenue, totalExpense: this.totalExpense, totalRidership: this.totalRidership,
      routeStats: [...this.routeStats.entries()],
      history: this.history,
    };
  }

  restore(data) {
    Object.assign(this, data);
    this.routeStats = new Map(data.routeStats || []);
    this.history = data.history || [];
  }
}
