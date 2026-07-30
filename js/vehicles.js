import * as THREE from 'three';
import { KM_PER_WORLD_UNIT } from './config.js';
import { buildExteriorMesh, applyWear } from './designer/vehicleMeshBuilder.js';
import { effectiveChassis } from './designer/chassisDefs.js';

let _vId = 1;
export function bumpVehicleIdCounter(n) { _vId = Math.max(_vId, n); }
const WEAR_MILEAGE_KM = 50000; // wearFactor reaches ~0.6 contribution around this odometer
const WEAR_AGE_DAYS = 365;     // and ~0.4 contribution around one in-game year

function addCrowdingBar(group, carHeight) {
  const y = carHeight + 1.2;
  const barBg = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.1), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
  barBg.position.y = y;
  group.add(barBg);
  const barFill = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 0.12), new THREE.MeshBasicMaterial({ color: 0x6ee7c9 }));
  barFill.position.set(0, y, 0.01);
  group.add(barFill);
  group.userData.barFill = barFill;
}

export class VehicleSystem {
  constructor(network, catalog, economy) {
    this.network = network;
    this.catalog = catalog;
    this.economy = economy;
    this.vehicles = new Map();
    this._listeners = { arrive: [] };
    this._group = null;
  }

  on(event, cb) { this._listeners[event].push(cb); }
  _emit(event, payload) { for (const cb of this._listeners[event]) cb(payload); }

  buildMeshes(scene) {
    this.scene = scene;
    this._group = new THREE.Group();
    scene.add(this._group);
  }

  // Ensure the route has exactly route.frequency vehicles, spaced along its path.
  syncRouteVehicles(route) {
    const model = this.catalog?.get(route.modelId);
    const want = (route.stationIds.length >= 2 && model) ? route.frequency : 0;
    const current = route.vehicleIds.filter(id => this.vehicles.has(id));
    route.vehicleIds = current;

    while (route.vehicleIds.length < want) {
      const id = `veh${_vId++}`;
      const spacing = route.length > 0 ? (route.length / want) * route.vehicleIds.length : 0;
      const chassis = effectiveChassis(model);
      const mesh = buildExteriorMesh(model, chassis);
      addCrowdingBar(mesh, mesh.userData.carHeight);
      this._group.add(mesh);
      const vehicle = {
        id, routeId: route.id, modelId: model.id, chassisId: model.chassisId,
        capacity: route.vehicleStats.capacityTotal,
        dist: spacing, dir: 1, dwell: 0,
        passengers: [],
        mileageKm: 0, ageSimDays: 0, wearFactor: 0,
        mesh,
      };
      this.vehicles.set(id, vehicle);
      route.vehicleIds.push(id);
    }
    while (route.vehicleIds.length > want) {
      const id = route.vehicleIds.pop();
      this.removeVehicle(id);
    }
    // an already-existing route whose model was resynced needs its capacity refreshed
    if (model) for (const id of route.vehicleIds) {
      const v = this.vehicles.get(id);
      if (v) v.capacity = route.vehicleStats.capacityTotal;
    }
    this._repositionAll(route);
  }

  removeVehicle(id) {
    const v = this.vehicles.get(id);
    if (!v) return;
    if (v.mesh && this._group) this._group.remove(v.mesh);
    this.vehicles.delete(id);
  }

  removeRouteVehicles(routeId) {
    for (const [id, v] of [...this.vehicles]) {
      if (v.routeId === routeId) this.removeVehicle(id);
    }
  }

  // ---------------- save/load ----------------

  resetAll() {
    for (const id of [...this.vehicles.keys()]) this.removeVehicle(id);
  }

  restoreVehicle(data, route) {
    const model = this.catalog?.get(data.modelId);
    if (!model) return null;
    const chassis = effectiveChassis(model);
    const mesh = buildExteriorMesh(model, chassis);
    addCrowdingBar(mesh, mesh.userData.carHeight);
    this._group.add(mesh);
    const vehicle = {
      id: data.id, routeId: data.routeId, modelId: data.modelId, chassisId: data.chassisId,
      capacity: route.vehicleStats?.capacityTotal || 1,
      dist: data.dist, dir: data.dir, dwell: data.dwell,
      passengers: [],
      mileageKm: data.mileageKm, ageSimDays: data.ageSimDays, wearFactor: data.wearFactor,
      brokenDown: !!data.brokenDown,
      mesh,
    };
    applyWear(mesh, vehicle.wearFactor);
    this.vehicles.set(vehicle.id, vehicle);
    route.vehicleIds.push(vehicle.id);
    const p = this.network.pointAtDistance(route, vehicle.dist);
    mesh.position.set(p.x, p.y, p.z);
    return vehicle;
  }

  _repositionAll(route) {
    for (const id of route.vehicleIds) {
      const v = this.vehicles.get(id);
      if (!v) continue;
      const p = this.network.pointAtDistance(route, v.dist);
      v.mesh.position.set(p.x, p.y, p.z);
    }
  }

  // ---------------- wear & aging ----------------

  _accumulateWear(vehicle, simMinutes, distanceTraveled) {
    vehicle.mileageKm += Math.abs(distanceTraveled) * KM_PER_WORLD_UNIT;
    vehicle.ageSimDays += simMinutes / 1440;
    vehicle.wearFactor = Math.min(1, (vehicle.mileageKm / WEAR_MILEAGE_KM) * 0.6 + (vehicle.ageSimDays / WEAR_AGE_DAYS) * 0.4);
    applyWear(vehicle.mesh, vehicle.wearFactor);
  }

  refurbish(vehicleId) {
    const v = this.vehicles.get(vehicleId);
    if (!v) return;
    v.mileageKm = 0;
    v.ageSimDays = 0;
    v.wearFactor = 0;
    applyWear(v.mesh, 0);
  }

  currentComfort(vehicle) {
    const route = this.network.routes.get(vehicle.routeId);
    const base = route?.vehicleStats?.comfortScore ?? 60;
    return base * (1 - vehicle.wearFactor * 0.25);
  }

  currentReliability(vehicle) {
    const route = this.network.routes.get(vehicle.routeId);
    const base = route?.vehicleStats?.reliabilityBase ?? 80;
    return base * (1 - vehicle.wearFactor * 0.35);
  }

  update(simMinutes) {
    for (const vehicle of this.vehicles.values()) {
      const route = this.network.routes.get(vehicle.routeId);
      if (!route || route.path.length < 2 || route.cumDistances.length < 2 || !route.vehicleStats) continue;
      if (vehicle.brokenDown || route.strikeActive) continue; // frozen in place until the disruption resolves

      if (vehicle.dwell > 0) {
        vehicle.dwell = Math.max(0, vehicle.dwell - simMinutes);
      } else {
        const weatherMult = route.type === 'subway' ? 1 : this.economy.weatherSpeedMultiplier;
        const speed = route.vehicleStats.topSpeed * this.economy.congestionSpeedMultiplier(route.type) * weatherMult;
        const prevDist = vehicle.dist;
        let newDist = prevDist + speed * simMinutes * vehicle.dir;
        this._accumulateWear(vehicle, simMinutes, speed * simMinutes);
        const cum = route.cumDistances;
        const seq = route.sequenceStationIds;
        const total = route.length;
        let crossedIdx = -1;

        if (vehicle.dir > 0) {
          for (let i = 1; i < cum.length; i++) {
            if (cum[i] > prevDist + 1e-6 && cum[i] <= newDist) { crossedIdx = i; break; }
          }
        } else {
          for (let i = cum.length - 2; i >= 0; i--) {
            if (cum[i] < prevDist - 1e-6 && cum[i] >= newDist) { crossedIdx = i; break; }
          }
        }

        if (crossedIdx >= 0) {
          vehicle.dist = cum[crossedIdx];
          const doorCount = route.vehicleStats.doorCount || 1;
          vehicle.dwell = Math.max(0.15, 0.5 * (1 - 0.08 * doorCount));
          const stationId = seq[crossedIdx];
          this._emit('arrive', { vehicle, route, stationId });
          if (route.loop) {
            if (crossedIdx === seq.length - 1) vehicle.dist = 0;
          } else {
            if (crossedIdx === seq.length - 1) vehicle.dir = -1;
            else if (crossedIdx === 0) vehicle.dir = 1;
          }
        } else {
          if (route.loop) {
            if (newDist >= total) newDist -= total;
            if (newDist < 0) newDist += total;
          } else {
            newDist = Math.max(0, Math.min(total, newDist));
          }
          vehicle.dist = newDist;
        }
      }

      const p = this.network.pointAtDistance(route, vehicle.dist);
      vehicle.mesh.position.set(p.x, p.y, p.z);
      // face direction of travel
      const ahead = this.network.pointAtDistance(route, vehicle.dist + (vehicle.dir > 0 ? 2 : -2));
      const angle = Math.atan2(ahead.x - p.x, ahead.z - p.z);
      if (isFinite(angle)) vehicle.mesh.rotation.y = angle;

      const load = vehicle.passengers.length / vehicle.capacity;
      const fill = vehicle.mesh.userData.barFill;
      fill.scale.x = Math.max(0.02, Math.min(1, load));
      fill.position.x = -1.1 * (1 - fill.scale.x);
      fill.material.color.setHex(load > 0.9 ? 0xff6b6b : load > 0.6 ? 0xffd166 : 0x6ee7c9);
    }
  }
}
