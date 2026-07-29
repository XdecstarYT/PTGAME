import { STARTING_BUDGET, BASE_FARE, VEHICLE_TYPES, STATION_MAINTENANCE_PER_DAY } from './config.js';

// Budget, fares, operating costs and the finance dashboard's data feed.
// Kept independent of rendering/network so it's easy to reason about.

export class Economy {
  constructor() {
    this.budget = STARTING_BUDGET;
    this.debt = 0;
    this.fare = BASE_FARE;

    this.dailyIncome = 0;
    this.dailyExpense = 0;
    this.dailyRidership = 0;
    this.lostDemandToday = 0;
    this.carTripsToday = 0;

    this.totalRevenue = 0;
    this.totalExpense = 0;
    this.totalRidership = 0;

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
  // across every route the passenger actually rode.
  earnFare(routeIds) {
    const amount = this.fare;
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

  // Called once per boarding (leg), independent of fare - drives per-route ridership stats.
  recordBoarding(routeId) {
    const r = this._routeEntry(routeId);
    r.ridersToday += 1;
    r.ridersTotal += 1;
  }

  recordLostDemand() { this.lostDemandToday += 1; }
  recordCarTrip() { this.carTripsToday += 1; }

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

  // called once per elapsed sim-day
  applyDailyCosts(network) {
    for (const route of network.routes.values()) {
      const def = VEHICLE_TYPES[route.type];
      const cost = def.opCostPerDay * route.frequency;
      this.spend(cost, route.id);
    }
    const stationCost = network.stations.size * STATION_MAINTENANCE_PER_DAY;
    if (stationCost > 0) this.spend(stationCost);
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
    });
    if (this.history.length > 120) this.history.shift();
    for (const r of this.routeStats.values()) { r.revenueToday = 0; r.costToday = 0; r.ridersToday = 0; }
    this.dailyIncome = 0;
    this.dailyExpense = 0;
    this.dailyRidership = 0;
    this.lostDemandToday = 0;
    this.carTripsToday = 0;
  }
}
