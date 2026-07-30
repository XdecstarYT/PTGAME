const RUSH_REPAIR_COST = 15000;
const SETTLE_STRIKE_COST = 40000;
const DAILY_EVENT_CHANCE = 0.4;

let _idCounter = 1;

// Random disruptions and economic shocks that stress-test an otherwise
// working network: breakdowns, strikes, weather, demand spikes, and periodic
// fuel/subsidy shocks. Ticks off time.js's 'newDay' event via onNewDay().
export class EventSystem {
  constructor({ network, vehicleSystem, economy, city, ui, staffing, cargoSystem }) {
    this.network = network;
    this.vehicleSystem = vehicleSystem;
    this.economy = economy;
    this.city = city;
    this.ui = ui;
    this.staffing = staffing;
    this.cargoSystem = cargoSystem;
    this.active = [];
  }

  onNewDay(day) {
    this._checkExpiry(day);
    if (Math.random() < DAILY_EVENT_CHANCE) this._triggerRandomEvent(day);
  }

  serialize() {
    // truck_breakdown is left out: truck ids aren't stable across a save/load
    // round-trip (trucks aren't individually persisted - see cargo.js/
    // saveLoad.js), so a restored event could never resolve against a real
    // truck anyway. Trucks simply respawn idle (not broken down) on load,
    // same simplification already applied to in-flight passengers/shipments.
    return this.active.filter(ev => ev.type !== 'truck_breakdown')
      .map(({ type, vehicleId, routeId, tileKey, stationId, label, expiresAtDay }) =>
        ({ type, vehicleId, routeId, tileKey, stationId, label, expiresAtDay }));
  }

  // The mutations themselves (brokenDown/strikeActive/multipliers/closed
  // tiles/demand spikes) are restored by their owning systems; this just
  // rebuilds the active-event list and its resolve callbacks.
  rehydrate(savedEvents) {
    this.active = (savedEvents || []).map(data => {
      const ev = { ...data };
      if (data.type === 'weather_slow') ev.onResolve = () => { this.economy.weatherSpeedMultiplier = 1; };
      else if (data.type === 'weather_bridge') ev.onResolve = () => {
        this.network.closedRoadTiles.delete(data.tileKey);
        this.network.recomputeAllCommittedRoutePaths();
        this.network.refreshMeshes();
      };
      else if (data.type === 'demand_spike') ev.onResolve = () => {
        const i = this.network.demandSpikes.findIndex(s => s.stationId === data.stationId);
        if (i >= 0) this.network.demandSpikes.splice(i, 1);
      };
      else if (data.type === 'fuel_spike') ev.onResolve = () => { this.economy.fuelPriceMultiplier = 1; };
      else if (data.type === 'subsidy_cut') ev.onResolve = () => { this.economy.subsidyMultiplier = 1; };
      return ev;
    });
  }

  _candidateTypes() {
    const types = ['weather_slow', 'fuel_spike', 'subsidy_cut'];
    const committedRoutes = [...this.network.routes.values()].filter(r => r.committed);
    if (this.vehicleSystem.vehicles.size > 0) {
      // understaffed/low-morale fleets are more break-down prone
      const weight = this.staffing ? Math.round(this.staffing.breakdownWeightMultiplier()) : 1;
      for (let i = 0; i < weight; i++) types.push('breakdown');
    }
    if (committedRoutes.some(r => !r.strikeActive)) types.push('strike');
    if (this._findBridgeTile()) types.push('weather_bridge');
    if (this.network.stations.size > 0) types.push('demand_spike');
    if (this.cargoSystem && [...this.cargoSystem.trucks.values()].some(t => t.state === 'idle' && !t.brokenDown)) {
      const weight = this.staffing ? Math.round(this.staffing.breakdownWeightMultiplier()) : 1;
      for (let i = 0; i < weight; i++) types.push('truck_breakdown');
    }
    return types;
  }

  _triggerRandomEvent(day) {
    const types = this._candidateTypes();
    if (!types.length) return;
    const type = types[Math.floor(Math.random() * types.length)];
    this._startEvent(type, day);
  }

  _findBridgeTile() {
    const already = this.network.closedRoadTiles;
    for (let x = 0; x < this.city.size; x++) {
      for (let z = 0; z < this.city.size; z++) {
        const t = this.city.tileAt(x, z);
        if (t && t.type === 'bridge' && !already.has(`${x}_${z}`)) return t;
      }
    }
    return null;
  }

  _pushEvent(ev) {
    ev.id = `ev${_idCounter++}`;
    this.active.push(ev);
    this.ui.showToast(`⚠️ ${ev.label}`, true);
  }

  _startEvent(type, day) {
    if (type === 'breakdown') {
      const candidates = [...this.vehicleSystem.vehicles.values()].filter(v => !v.brokenDown);
      if (!candidates.length) return;
      const vehicle = candidates[Math.floor(Math.random() * candidates.length)];
      const route = this.network.routes.get(vehicle.routeId);
      vehicle.brokenDown = true;
      const moraleStretch = this.staffing ? Math.max(1, this.staffing.breakdownWeightMultiplier()) : 1;
      this._pushEvent({
        type, vehicleId: vehicle.id,
        label: `Vehicle breakdown on ${route?.name || 'a route'} - one fewer vehicle running until repaired.`,
        expiresAtDay: day + Math.round((1 + Math.floor(Math.random() * 2)) * moraleStretch),
      });
    } else if (type === 'strike') {
      const committed = [...this.network.routes.values()].filter(r => r.committed && !r.strikeActive);
      if (!committed.length) return;
      const route = committed[Math.floor(Math.random() * committed.length)];
      route.strikeActive = true;
      this._pushEvent({
        type, routeId: route.id,
        label: `Driver strike on ${route.name} - service suspended until settled.`,
        expiresAtDay: day + 1 + Math.floor(Math.random() * 2),
      });
    } else if (type === 'weather_slow') {
      this.economy.weatherSpeedMultiplier = 0.65;
      this._pushEvent({
        type,
        label: 'Storm slowing surface traffic - buses and trams running at reduced speed.',
        expiresAtDay: day + 1,
        onResolve: () => { this.economy.weatherSpeedMultiplier = 1; },
      });
    } else if (type === 'weather_bridge') {
      const tile = this._findBridgeTile();
      if (!tile) return;
      const key = `${tile.x}_${tile.z}`;
      this.network.closedRoadTiles.add(key);
      this.network.recomputeAllCommittedRoutePaths();
      this.network.refreshMeshes();
      this._pushEvent({
        type, tileKey: key,
        label: 'Flooding has closed a bridge - surface routes are rerouting around it.',
        expiresAtDay: day + 1 + Math.floor(Math.random() * 2),
        onResolve: () => {
          this.network.closedRoadTiles.delete(key);
          this.network.recomputeAllCommittedRoutePaths();
          this.network.refreshMeshes();
        },
      });
    } else if (type === 'demand_spike') {
      const stations = [...this.network.stations.values()];
      if (!stations.length) return;
      const station = stations[Math.floor(Math.random() * stations.length)];
      const spike = { stationId: station.id, multiplier: 2.5, expiresAtDay: day + 1 };
      this.network.demandSpikes.push(spike);
      this._pushEvent({
        type, stationId: station.id,
        label: `A festival near ${station.name} is drawing a big crowd - expect a surge in ridership.`,
        expiresAtDay: spike.expiresAtDay,
        onResolve: () => {
          const i = this.network.demandSpikes.indexOf(spike);
          if (i >= 0) this.network.demandSpikes.splice(i, 1);
        },
      });
    } else if (type === 'fuel_spike') {
      this.economy.fuelPriceMultiplier = 1.5;
      this._pushEvent({
        type,
        label: 'Fuel prices have spiked - running costs are up for diesel/hybrid/hydrogen vehicles.',
        expiresAtDay: day + 3 + Math.floor(Math.random() * 3),
        onResolve: () => { this.economy.fuelPriceMultiplier = 1; },
      });
    } else if (type === 'subsidy_cut') {
      this.economy.subsidyMultiplier = 0;
      this._pushEvent({
        type,
        label: 'City council has cut the transit subsidy - fare revenue per rider is down.',
        expiresAtDay: day + 3 + Math.floor(Math.random() * 3),
        onResolve: () => { this.economy.subsidyMultiplier = 1; },
      });
    } else if (type === 'truck_breakdown') {
      const candidates = [...this.cargoSystem.trucks.values()].filter(t => t.state === 'idle' && !t.brokenDown);
      if (!candidates.length) return;
      const truck = candidates[Math.floor(Math.random() * candidates.length)];
      const depot = this.cargoSystem.depots.get(truck.depotId);
      truck.brokenDown = true;
      const moraleStretch = this.staffing ? Math.max(1, this.staffing.breakdownWeightMultiplier()) : 1;
      this._pushEvent({
        type, truckId: truck.id,
        label: `Truck breakdown at ${depot?.name || 'a depot'} - one fewer truck hauling until repaired.`,
        expiresAtDay: day + Math.round((1 + Math.floor(Math.random() * 2)) * moraleStretch),
      });
    }
  }

  _checkExpiry(day) {
    for (const ev of [...this.active]) {
      if (day >= ev.expiresAtDay) this._resolveEvent(ev);
    }
  }

  _resolveEvent(ev) {
    if (ev.type === 'breakdown') {
      const v = this.vehicleSystem.vehicles.get(ev.vehicleId);
      if (v) v.brokenDown = false;
    } else if (ev.type === 'strike') {
      const r = this.network.routes.get(ev.routeId);
      if (r) r.strikeActive = false;
    } else if (ev.type === 'truck_breakdown') {
      const t = this.cargoSystem?.trucks.get(ev.truckId);
      if (t) t.brokenDown = false;
    } else if (ev.onResolve) {
      ev.onResolve();
    }
    this.active = this.active.filter(e => e !== ev);
    this.ui.showToast(`✅ Resolved: ${ev.label}`);
  }

  // ---------------- player actions ----------------

  rushRepair(vehicleId) {
    const ev = this.active.find(e => e.type === 'breakdown' && e.vehicleId === vehicleId);
    if (!ev) return false;
    if (!this.economy.canAfford(RUSH_REPAIR_COST)) return false;
    this.economy.spend(RUSH_REPAIR_COST);
    this._resolveEvent(ev);
    return true;
  }

  rushRepairTruck(truckId) {
    const ev = this.active.find(e => e.type === 'truck_breakdown' && e.truckId === truckId);
    if (!ev) return false;
    if (!this.economy.canAfford(RUSH_REPAIR_COST)) return false;
    this.economy.spend(RUSH_REPAIR_COST);
    this._resolveEvent(ev);
    return true;
  }

  settleStrike(routeId) {
    const ev = this.active.find(e => e.type === 'strike' && e.routeId === routeId);
    if (!ev) return false;
    if (!this.economy.canAfford(SETTLE_STRIKE_COST)) return false;
    this.economy.spend(SETTLE_STRIKE_COST);
    this._resolveEvent(ev);
    return true;
  }

  get rushRepairCost() { return RUSH_REPAIR_COST; }
  get settleStrikeCost() { return SETTLE_STRIKE_COST; }
}
