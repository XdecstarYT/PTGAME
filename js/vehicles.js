import * as THREE from 'three';
import { VEHICLE_TYPES } from './config.js';

let _vId = 1;

function buildVehicleMesh(type) {
  const group = new THREE.Group();
  const def = VEHICLE_TYPES[type];
  const mat = new THREE.MeshStandardMaterial({ color: def.color, flatShading: true, roughness: 0.6, metalness: 0.1 });

  let body;
  if (type === 'bus') {
    body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2, 1.8), mat);
    body.position.y = 1.3;
  } else if (type === 'tram') {
    body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.4, 2.1), mat);
    body.position.y = 1.5;
  } else {
    body = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 4.4, 4, 8), mat);
    body.rotation.z = Math.PI / 2;
    body.position.y = 1.3;
  }
  body.castShadow = true;
  group.add(body);

  // crowding indicator: small bar above the vehicle
  const barBg = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.35, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x1a1a1a })
  );
  barBg.position.y = 3.1;
  group.add(barBg);

  const barFill = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.35, 0.12),
    new THREE.MeshBasicMaterial({ color: 0x6ee7c9 })
  );
  barFill.position.y = 3.1;
  barFill.position.z = 0.01;
  group.add(barFill);
  group.userData.barFill = barFill;

  return group;
}

export class VehicleSystem {
  constructor(network) {
    this.network = network;
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
    const want = route.stationIds.length >= 2 ? route.frequency : 0;
    const current = route.vehicleIds.filter(id => this.vehicles.has(id));
    route.vehicleIds = current;

    while (route.vehicleIds.length < want) {
      const id = `veh${_vId++}`;
      const spacing = route.length > 0 ? (route.length / want) * route.vehicleIds.length : 0;
      const def = VEHICLE_TYPES[route.type];
      const mesh = buildVehicleMesh(route.type);
      this._group.add(mesh);
      const vehicle = {
        id, routeId: route.id, type: route.type,
        capacity: def.capacity,
        dist: spacing, dir: 1, dwell: 0,
        passengers: [],
        mesh,
      };
      this.vehicles.set(id, vehicle);
      route.vehicleIds.push(id);
    }
    while (route.vehicleIds.length > want) {
      const id = route.vehicleIds.pop();
      this.removeVehicle(id);
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

  _repositionAll(route) {
    for (const id of route.vehicleIds) {
      const v = this.vehicles.get(id);
      if (!v) continue;
      const p = this.network.pointAtDistance(route, v.dist);
      v.mesh.position.set(p.x, p.y, p.z);
    }
  }

  update(simMinutes) {
    for (const vehicle of this.vehicles.values()) {
      const route = this.network.routes.get(vehicle.routeId);
      if (!route || route.path.length < 2 || route.cumDistances.length < 2) continue;
      const def = VEHICLE_TYPES[route.type];

      if (vehicle.dwell > 0) {
        vehicle.dwell = Math.max(0, vehicle.dwell - simMinutes);
      } else {
        const speed = def.speed;
        const prevDist = vehicle.dist;
        let newDist = prevDist + speed * simMinutes * vehicle.dir;
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
          vehicle.dwell = 0.5;
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
