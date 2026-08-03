import { bumpIdCounter } from './network.js';
import { bumpVehicleIdCounter } from './vehicles.js';
import { bumpCargoIdCounter } from './cargo.js';

const STORAGE_PREFIX = 'ptgame_save_';
export const SLOT_COUNT = 3;

function maxNumericSuffix(ids) {
  let max = 0;
  for (const id of ids) {
    const m = /(\d+)$/.exec(id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

// Saves/restores everything except the vehicle catalog, which persists on
// its own (a player's designs are a cross-save library, not tied to one
// city). In-flight passengers aren't persisted either - they respawn
// naturally within moments of resuming, which is a lot simpler than trying
// to serialize mid-walk/mid-ride passenger state.
export class SaveLoadSystem {
  constructor({
    city, network, vehicleSystem, economy, timeSystem, eventSystem, contractSystem, staffing, ui, schematicView,
    cargoSystem, shippingContractSystem, buildingCatalog,
  }) {
    this.city = city;
    this.network = network;
    this.vehicleSystem = vehicleSystem;
    this.economy = economy;
    this.timeSystem = timeSystem;
    this.eventSystem = eventSystem;
    this.contractSystem = contractSystem;
    this.staffing = staffing;
    this.ui = ui;
    this.schematicView = schematicView;
    this.cargoSystem = cargoSystem;
    this.shippingContractSystem = shippingContractSystem;
    this.buildingCatalog = buildingCatalog;
  }

  listSlots() {
    const slots = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const raw = localStorage.getItem(STORAGE_PREFIX + i);
      let meta = null;
      if (raw) {
        try { meta = JSON.parse(raw).meta; } catch (e) { meta = null; }
      }
      slots.push(meta);
    }
    return slots;
  }

  save(slot) {
    try {
      localStorage.setItem(STORAGE_PREFIX + slot, JSON.stringify(this._serialize()));
      return true;
    } catch (e) {
      return false;
    }
  }

  load(slot) {
    const raw = localStorage.getItem(STORAGE_PREFIX + slot);
    if (!raw) return false;
    let data;
    try { data = JSON.parse(raw); } catch (e) { return false; }
    this._restore(data);
    return true;
  }

  deleteSlot(slot) {
    localStorage.removeItem(STORAGE_PREFIX + slot);
  }

  _serialize() {
    return {
      meta: { savedAt: Date.now(), day: this.timeSystem.day, budget: Math.round(this.economy.budget) },
      city: {
        seed: this.city.seed,
        growthRadius: this.city.growthRadius,
        scenario: this.city.scenario,
        blocks: [...this.city.blocks.values()].map(b => ({ id: b.id, unlocked: b.unlocked, maturity: b.maturity })),
      },
      time: { day: this.timeSystem.day, minutesOfDay: this.timeSystem.minutesOfDay, speed: this.timeSystem.speed },
      economy: this.economy.serialize(),
      stations: [...this.network.stations.values()].map(s => ({
        id: s.id, name: s.name, x: s.x, z: s.z, roadTile: s.roadTile,
        designId: s.designId, design: s.design,
      })),
      routes: [...this.network.routes.values()].map(r => ({
        id: r.id, name: r.name, type: r.type, color: r.color, stationIds: r.stationIds, loop: r.loop,
        frequency: r.frequency, modelId: r.modelId, committed: r.committed, strikeActive: !!r.strikeActive,
      })),
      trackedTiles: [...this.network.trackedTiles],
      closedRoadTiles: [...this.network.closedRoadTiles],
      demandSpikes: this.network.demandSpikes,
      vehicles: [...this.vehicleSystem.vehicles.values()].map(v => ({
        id: v.id, routeId: v.routeId, modelId: v.modelId, chassisId: v.chassisId,
        dist: v.dist, dir: v.dir, dwell: v.dwell, mileageKm: v.mileageKm, ageSimDays: v.ageSimDays,
        wearFactor: v.wearFactor, brokenDown: !!v.brokenDown,
      })),
      events: this.eventSystem.serialize(),
      contracts: this.contractSystem.serialize(),
      contractsCompleted: this.contractSystem.completedCount,
      staffing: { drivers: this.staffing.drivers, mechanics: this.staffing.mechanics, dockWorkers: this.staffing.dockWorkers, morale: this.staffing.morale },
      depots: [...this.cargoSystem.depots.values()].map(d => ({
        id: d.id, name: d.name, x: d.x, z: d.z, roadTile: d.roadTile,
        modelId: d.modelId, truckCount: d.truckCount, stats: d.stats,
      })),
      deliveredTonsByType: this.cargoSystem.deliveredTonsByType,
      cargoDeliveredCount: this.cargoSystem.deliveredCount,
      shippingContracts: this.shippingContractSystem.serialize(),
      shippingContractsCompleted: this.shippingContractSystem.completedCount,
      customBuildings: [...this.city.customBuildings.values()].map(e => ({ x: e.x, z: e.z, designId: e.design.id })),
    };
  }

  _restore(data) {
    this.city.regenerateFromSave(data.city.seed, data.city.growthRadius, data.city.blocks, data.city.scenario);

    this.vehicleSystem.resetAll();
    this.network.resetAll();

    this.economy.restore(data.economy);
    this.staffing.drivers = data.staffing.drivers;
    this.staffing.mechanics = data.staffing.mechanics;
    this.staffing.dockWorkers = data.staffing.dockWorkers ?? 2;
    this.staffing.morale = data.staffing.morale;
    this.timeSystem.day = data.time.day;
    this.timeSystem.minutesOfDay = data.time.minutesOfDay;
    this.timeSystem.setSpeed(data.time.speed);

    for (const key of data.trackedTiles || []) this.network.trackedTiles.add(key);
    for (const key of data.closedRoadTiles || []) this.network.closedRoadTiles.add(key);
    this.network.demandSpikes.push(...(data.demandSpikes || []));

    for (const s of data.stations || []) this.network.restoreStation(s);
    for (const r of data.routes || []) this.network.restoreRoute(r, this.economy.activeRegulationId);
    for (const v of data.vehicles || []) {
      const route = this.network.routes.get(v.routeId);
      if (route) this.vehicleSystem.restoreVehicle(v, route);
    }

    this.cargoSystem.resetAll();
    for (const d of data.depots || []) this.cargoSystem.restoreDepot(d);
    this.cargoSystem.deliveredTonsByType = data.deliveredTonsByType || {};
    this.cargoSystem.deliveredCount = data.cargoDeliveredCount || 0;

    this.eventSystem.rehydrate(data.events);
    this.contractSystem.rehydrate(data.contracts);
    this.contractSystem.completedCount = data.contractsCompleted || 0;
    this.shippingContractSystem.rehydrate(data.shippingContracts);
    this.shippingContractSystem.completedCount = data.shippingContractsCompleted || 0;

    for (const cb of data.customBuildings || []) {
      const design = this.buildingCatalog.get(cb.designId);
      if (design) this.city.placeCustomBuilding(cb.x, cb.z, design);
    }

    bumpIdCounter(maxNumericSuffix([...(data.stations || []), ...(data.routes || [])].map(x => x.id)));
    bumpVehicleIdCounter(maxNumericSuffix((data.vehicles || []).map(v => v.id)));
    bumpCargoIdCounter(maxNumericSuffix((data.depots || []).map(d => d.id)));

    this.network.refreshMeshes();
    this.ui.closePanel();
    this.ui.refreshRouteChips();
    this.ui.refreshHud();
    if (this.schematicView) this.schematicView.markDirty();
  }
}
