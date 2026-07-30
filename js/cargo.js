import * as THREE from 'three';
import { TILE_SIZE, CARGO_TYPES, FREIGHT_SHIPMENT_SPAWN_RATE, CARGO_DEPOT_MAINTENANCE_PER_DAY } from './config.js';
import { freightChassisById } from './designer/freightChassisDefs.js';
import { computeFreightStats } from './designer/freightModel.js';
import { buildFreightExteriorMesh } from './designer/freightMeshBuilder.js';

const DEPOT_CATCHMENT_RADIUS = TILE_SIZE * 2.4;
const MIN_SHIPMENT_TONS = 3, MAX_SHIPMENT_TONS_EXTRA = 6;

let _idCounter = 1;
function nextId(prefix) { return `${prefix}${_idCounter++}`; }
export function bumpCargoIdCounter(n) { _idCounter = Math.max(_idCounter, n); }

function buildWorldPath(city, roadGraph, fromTile, toTile) {
  const nodes = roadGraph.shortestPath(fromTile, toTile);
  if (!nodes) return null;
  const points = nodes.map(n => city.tileCenterWorld(n.x, n.z));
  const dists = [0];
  for (let i = 1; i < points.length; i++) dists.push(dists[i - 1] + points[i].distanceTo(points[i - 1]));
  return { points, dists, total: dists[dists.length - 1] || 0 };
}

function pointAtDistance(path, dist) {
  const { points, dists, total } = path;
  if (points.length < 2) return points[0]?.clone() || new THREE.Vector3();
  const clamped = Math.max(0, Math.min(total, dist));
  let lo = 0, hi = dists.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (dists[mid] <= clamped) lo = mid; else hi = mid;
  }
  const seg = dists[hi] - dists[lo] || 1;
  const t = (clamped - dists[lo]) / seg;
  return new THREE.Vector3().lerpVectors(points[lo], points[hi], t);
}

// Cargo types an industrial-anchored depot can source (raw materials +
// manufactured goods start life at an industrial tile).
const SOURCEABLE_FROM_INDUSTRIAL = Object.values(CARGO_TYPES).filter(c => c.sourceZone === 'industrial');

// Renders a depot's name onto a small canvas texture for its yard sign -
// same low-fidelity-but-real technique the station builder's entrance
// signs and the freight mesh builder's side decals use.
function depotSignTexture(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1a1712';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffcc66';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(name || 'DEPOT').slice(0, 16).toUpperCase(), canvas.width / 2, canvas.height / 2);
  return new THREE.CanvasTexture(canvas);
}

// Owns depots, shipments, and the trucks that haul them - the freight
// equivalent of network.js (depots) + passengers.js (demand) + vehicles.js
// (moving entities) rolled into one system, deliberately simpler than any of
// those: no timetabled routes, just nearest-match dispatch between depots.
export class CargoSystem {
  constructor(city, network, economy) {
    this.city = city;
    this.network = network;
    this.economy = economy;
    this.depots = new Map();
    this.shipments = new Map();
    this.trucks = new Map();
    this.deliveredCount = 0;
    this.spoiledCount = 0;
    this.deliveredTonsByType = {}; // cargoTypeId -> cumulative tons delivered, for shippingContracts.js
    this._spawnAccum = new Map(); // depotId -> fractional accumulator
    this._group = null;
  }

  buildMeshes(scene) {
    this.scene = scene;
    this._group = new THREE.Group();
    scene.add(this._group);
  }

  // ---------------- depots ----------------

  canPlaceDepot(x, z) {
    if (!this.city.isBuildable(x, z)) return { ok: false, reason: 'Must be placed on a developed zone tile.' };
    const road = this.city.nearestRoadTile(x, z, 3);
    if (!road) return { ok: false, reason: 'No road access within range.' };
    for (const d of this.depots.values()) {
      if (d.x === x && d.z === z) return { ok: false, reason: 'A depot already exists here.' };
      const dx = d.worldX - (x + 0.5) * TILE_SIZE, dz = d.worldZ - (z + 0.5) * TILE_SIZE;
      if (Math.sqrt(dx * dx + dz * dz) < TILE_SIZE * 1.1) return { ok: false, reason: 'Too close to another depot.' };
    }
    for (const s of this.network.stations.values()) {
      const dx = s.worldX - (x + 0.5) * TILE_SIZE, dz = s.worldZ - (z + 0.5) * TILE_SIZE;
      if (Math.sqrt(dx * dx + dz * dz) < TILE_SIZE * 0.7) return { ok: false, reason: 'Too close to a passenger station.' };
    }
    return { ok: true, road };
  }

  addDepot(x, z, name) {
    const check = this.canPlaceDepot(x, z);
    if (!check.ok) return null;
    const id = nextId('depot');
    const pos = this.city.tileCenterWorld(x, z);
    const depot = {
      id, name: name || `Depot ${this.depots.size + 1}`,
      x, z, worldX: pos.x, worldZ: pos.z, roadTile: check.road,
      radius: DEPOT_CATCHMENT_RADIUS,
      modelId: null, truckCount: 0, truckIds: [],
      stats: { shipmentsSpawned: 0, shipmentsDelivered: 0 },
    };
    this.depots.set(id, depot);
    this._buildDepotMarker(depot);
    return depot;
  }

  removeDepot(id) {
    const depot = this.depots.get(id);
    if (!depot) return;
    for (const tid of [...depot.truckIds]) this._removeTruck(tid);
    for (const s of [...this.shipments.values()]) {
      if (s.originDepotId === id || s.destDepotId === id) this.shipments.delete(s.id);
    }
    if (depot._marker && this._group) this._group.remove(depot._marker);
    this.depots.delete(id);
  }

  // A small freight yard - pavement pad, a corrugated warehouse with a
  // loading-dock canopy, an office annex, yard lights, and a lit signpost
  // with the depot's name - replacing the earlier placeholder pole+box
  // marker with something that actually reads as an industrial yard.
  _buildDepotMarker(depot) {
    const group = new THREE.Group();

    const padMat = new THREE.MeshStandardMaterial({ color: 0x51524f, roughness: 1 });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE * 0.86, 0.12, TILE_SIZE * 0.86), padMat);
    pad.position.y = 0.06;
    pad.receiveShadow = true;
    group.add(pad);

    const warehouseMat = new THREE.MeshStandardMaterial({ color: 0x6b7580, roughness: 0.7, metalness: 0.15 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3c414a, roughness: 0.6 });
    const wh = { len: 6.4, h: 3.4, w: 4.6 };
    const whX = -1.6;
    const warehouse = new THREE.Mesh(new THREE.BoxGeometry(wh.len, wh.h, wh.w), warehouseMat);
    warehouse.position.set(whX, wh.h / 2, 0);
    warehouse.castShadow = true; warehouse.receiveShadow = true;
    group.add(warehouse);
    const roofCap = new THREE.Mesh(new THREE.BoxGeometry(wh.len * 1.02, 0.2, wh.w * 1.02), roofMat);
    roofCap.position.set(whX, wh.h + 0.1, 0);
    roofCap.castShadow = true;
    group.add(roofCap);

    // Roll-up bay door facing the yard's +X apron.
    const bayDoorMat = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.6 });
    const bayDoor = new THREE.Mesh(new THREE.BoxGeometry(0.08, wh.h * 0.7, wh.w * 0.5), bayDoorMat);
    bayDoor.position.set(whX + wh.len / 2 + 0.02, wh.h * 0.35, 0);
    group.add(bayDoor);

    // Loading-dock canopy over the bay door.
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xd9a066, roughness: 0.6 });
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, wh.w * 0.7), canopyMat);
    canopy.position.set(whX + wh.len / 2 + 0.8, wh.h * 0.68, 0);
    canopy.castShadow = true;
    group.add(canopy);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2a33 });
    for (const pz of [-wh.w * 0.32, wh.w * 0.32]) {
      const support = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, wh.h * 0.68, 8), poleMat);
      support.position.set(whX + wh.len / 2 + 1.5, wh.h * 0.34, pz);
      group.add(support);
    }

    // Office annex tucked at the warehouse's rear corner.
    const officeMat = new THREE.MeshStandardMaterial({ color: 0xd9cbb0, roughness: 0.8 });
    const office = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.1, 2.0), officeMat);
    office.position.set(whX - wh.len / 2 - 0.9, 1.05, wh.w / 2 - 1.0);
    office.castShadow = true; office.receiveShadow = true;
    group.add(office);
    const officeWindowMat = new THREE.MeshStandardMaterial({ color: 0x0c1420, roughness: 0.3, emissive: 0xffdb8a, emissiveIntensity: 0.15 });
    const officeWindow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 1.2), officeWindowMat);
    officeWindow.position.set(whX - wh.len / 2 - 0.9 + 0.9, 1.2, wh.w / 2 - 1.0);
    group.add(officeWindow);

    // Yard lights at two pad corners.
    const lampGlowMat = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xfff2c0, emissiveIntensity: 0.7 });
    for (const [lx, lz] of [[TILE_SIZE * 0.36, TILE_SIZE * 0.36], [TILE_SIZE * 0.36, -TILE_SIZE * 0.36]]) {
      const lampPole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8), poleMat);
      lampPole.position.set(lx, 1.6, lz);
      lampPole.castShadow = true;
      group.add(lampPole);
      const lampHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), lampGlowMat);
      lampHead.position.set(lx, 3.25, lz);
      group.add(lampHead);
    }

    // Lit signpost with the depot's name - keeps depots identifiable from a
    // distance the way the old amber beacon box was, but actually legible.
    const signPole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 8), poleMat);
    signPole.position.set(TILE_SIZE * 0.34, 1.3, 0);
    signPole.castShadow = true;
    group.add(signPole);
    const signTex = depotSignTexture(depot.name);
    const signBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.6),
      new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.5 }),
    );
    signBoard.position.set(TILE_SIZE * 0.34, 2.75, 0);
    signBoard.rotation.y = Math.PI / 2;
    signBoard.userData.isDepotSign = true;
    group.add(signBoard);

    group.position.set(depot.worldX, 0, depot.worldZ);
    this._group.add(group);
    depot._marker = group;
  }

  // Keeps the yard signpost's name texture in sync when a depot is renamed.
  _refreshDepotSign(depot) {
    if (!depot._marker) return;
    depot._marker.traverse(o => {
      if (!o.userData.isDepotSign) return;
      o.material.map?.dispose();
      const tex = depotSignTexture(depot.name);
      o.material.map = tex;
      o.material.emissiveMap = tex;
      o.material.needsUpdate = true;
    });
  }

  // Rebuilds a previously-paid-for depot from save data - no cost, no
  // placement checks. In-flight shipments/truck positions aren't persisted
  // (same policy saveLoad.js already applies to in-flight passengers) -
  // trucks just respawn idle at their home depot and pick up new work.
  restoreDepot(data) {
    const pos = this.city.tileCenterWorld(data.x, data.z);
    const depot = {
      id: data.id, name: data.name, x: data.x, z: data.z, worldX: pos.x, worldZ: pos.z,
      roadTile: data.roadTile, radius: DEPOT_CATCHMENT_RADIUS,
      modelId: null, truckCount: 0, truckIds: [],
      stats: { shipmentsSpawned: data.stats?.shipmentsSpawned || 0, shipmentsDelivered: data.stats?.shipmentsDelivered || 0 },
    };
    this.depots.set(depot.id, depot);
    this._buildDepotMarker(depot);
    const model = data.modelId ? this.catalog?.models.get(data.modelId) : null;
    if (model) this.assignModelToDepot(depot, model, data.truckCount || 0);
    return depot;
  }

  // Assigns a freight VehicleModel (from the catalog, kind: 'freight') to a
  // depot and spawns/trims truck entities to match truckCount, mirroring how
  // vehicles.syncRouteVehicles keeps a route's fleet in sync with frequency.
  assignModelToDepot(depot, model, truckCount) {
    depot.modelId = model.id;
    depot.truckCount = Math.max(0, Math.round(truckCount));
    this._syncDepotTrucks(depot, model);
  }

  _syncDepotTrucks(depot, model) {
    const chassis = freightChassisById(model.chassisId);
    while (depot.truckIds.length < depot.truckCount) {
      const id = nextId('truck');
      const mesh = buildFreightExteriorMesh(model, chassis);
      this._group.add(mesh);
      mesh.position.set(depot.worldX, 0, depot.worldZ);
      const truck = {
        id, depotId: depot.id, modelId: model.id, chassisId: model.chassisId,
        state: 'idle', shipmentId: null, phase: null,
        path: null, dist: 0, roadTile: depot.roadTile,
        worldX: depot.worldX, worldZ: depot.worldZ,
        brokenDown: false,
        mesh,
      };
      this.trucks.set(id, truck);
      depot.truckIds.push(id);
    }
    while (depot.truckIds.length > depot.truckCount) {
      const id = depot.truckIds.pop();
      this._removeTruck(id);
    }
  }

  _removeTruck(id) {
    const t = this.trucks.get(id);
    if (!t) return;
    if (t.mesh && this._group) this._group.remove(t.mesh);
    this.trucks.delete(id);
  }

  resetAll() {
    for (const id of [...this.trucks.keys()]) this._removeTruck(id);
    this.depots.clear();
    this.shipments.clear();
    this._spawnAccum.clear();
    this.deliveredCount = 0;
    this.spoiledCount = 0;
    this.deliveredTonsByType = {};
  }

  // ---------------- shipment demand ----------------

  _industrialTilesNear(depot) {
    const tiles = [];
    const r = Math.ceil(depot.radius / TILE_SIZE) + 1;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const tx = depot.x + dx, tz = depot.z + dz;
        const tile = this.city.tileAt(tx, tz);
        if (!tile || tile.type !== 'industrial') continue;
        const wdx = tile.worldX - depot.worldX, wdz = tile.worldZ - depot.worldZ;
        if (Math.hypot(wdx, wdz) <= depot.radius) tiles.push(tile);
      }
    }
    return tiles;
  }

  _spawnShipments(simMinutes) {
    for (const depot of this.depots.values()) {
      const industrialTiles = this._industrialTilesNear(depot);
      if (!industrialTiles.length) continue;
      const totalJobs = industrialTiles.reduce((sum, t) => sum + this.city.effectiveJobs(t), 0);
      if (totalJobs <= 0) continue;

      const prev = this._spawnAccum.get(depot.id) || 0;
      const chance = prev + (totalJobs * FREIGHT_SHIPMENT_SPAWN_RATE * (simMinutes / 1440));
      if (chance < 1) { this._spawnAccum.set(depot.id, chance); continue; }
      this._spawnAccum.set(depot.id, chance - 1);

      // needs another depot with room to receive this cargo type
      const cargoType = SOURCEABLE_FROM_INDUSTRIAL[Math.floor(Math.random() * SOURCEABLE_FROM_INDUSTRIAL.length)];
      const destDepot = this._findDestinationDepot(depot, cargoType);
      if (!destDepot) continue;

      const tons = Math.round(MIN_SHIPMENT_TONS + Math.random() * MAX_SHIPMENT_TONS_EXTRA);
      const id = nextId('ship');
      this.shipments.set(id, {
        id, cargoTypeId: cargoType.id, tons,
        originDepotId: depot.id, destDepotId: destDepot.id,
        state: 'waiting', truckId: null, ageMinutes: 0,
        spoilMinutes: cargoType.spoilMinutes ?? null,
      });
      depot.stats.shipmentsSpawned++;
    }
  }

  // Any other depot whose catchment includes a tile matching the cargo
  // type's sink zone is a valid destination - nearest one wins.
  _findDestinationDepot(originDepot, cargoType) {
    let best = null, bestDist = Infinity;
    for (const depot of this.depots.values()) {
      if (depot.id === originDepot.id) continue;
      const hasSinkTile = this._zoneNear(depot, cargoType.sinkZone);
      if (!hasSinkTile) continue;
      const dist = Math.hypot(depot.worldX - originDepot.worldX, depot.worldZ - originDepot.worldZ);
      if (dist < bestDist) { bestDist = dist; best = depot; }
    }
    return best;
  }

  _zoneNear(depot, zoneType) {
    const r = Math.ceil(depot.radius / TILE_SIZE) + 1;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const tile = this.city.tileAt(depot.x + dx, depot.z + dz);
        if (!tile || tile.type !== zoneType) continue;
        if (Math.hypot(tile.worldX - depot.worldX, tile.worldZ - depot.worldZ) <= depot.radius) return true;
      }
    }
    return false;
  }

  _decayAndExpire(simMinutes) {
    for (const s of [...this.shipments.values()]) {
      if (s.state === 'delivered' || s.state === 'spoiled') continue;
      s.ageMinutes += simMinutes;
      if (s.spoilMinutes && s.ageMinutes > s.spoilMinutes) {
        if (s.truckId) {
          const truck = this.trucks.get(s.truckId);
          if (truck) { truck.state = 'idle'; truck.shipmentId = null; truck.path = null; }
        }
        s.state = 'spoiled';
        this.spoiledCount++;
        this.shipments.delete(s.id);
      }
    }
  }

  // ---------------- dispatch & movement ----------------

  _dispatchIdleTrucks() {
    const waiting = [...this.shipments.values()].filter(s => s.state === 'waiting').sort((a, b) => a.ageMinutes - b.ageMinutes);
    for (const shipment of waiting) {
      const origin = this.depots.get(shipment.originDepotId);
      const dest = this.depots.get(shipment.destDepotId);
      if (!origin || !dest) continue;

      let bestTruck = null, bestDist = Infinity;
      for (const truck of this.trucks.values()) {
        if (truck.state !== 'idle' || truck.brokenDown) continue;
        const chassis = freightChassisById(truck.chassisId);
        if (!chassis.compatibleCargo.includes(shipment.cargoTypeId)) continue;
        const dist = Math.hypot(truck.worldX - origin.worldX, truck.worldZ - origin.worldZ);
        if (dist < bestDist) { bestDist = dist; bestTruck = truck; }
      }
      if (!bestTruck) continue;

      const toPickup = buildWorldPath(this.city, this.network.roadGraph, bestTruck.roadTile, origin.roadTile);
      const toDest = buildWorldPath(this.city, this.network.roadGraph, origin.roadTile, dest.roadTile);
      if (!toPickup || !toDest) continue;

      bestTruck.state = 'enroute';
      bestTruck.phase = 'pickup';
      bestTruck.path = toPickup;
      bestTruck.dist = 0;
      bestTruck.shipmentId = shipment.id;
      bestTruck._destPath = toDest; // queued for the haul leg once pickup completes
      shipment.state = 'assigned';
      shipment.truckId = bestTruck.id;
    }
  }

  _moveTrucks(simMinutes) {
    for (const truck of this.trucks.values()) {
      if (truck.state !== 'enroute' || !truck.path) continue;
      const chassis = freightChassisById(truck.chassisId);
      const stats = this._truckStats(truck, chassis);
      const speed = stats.topSpeed;
      truck.dist += speed * simMinutes;

      if (truck.dist >= truck.path.total) {
        if (truck.phase === 'pickup') {
          const shipment = this.shipments.get(truck.shipmentId);
          truck.phase = 'haul';
          truck.path = truck._destPath;
          truck._destPath = null;
          truck.dist = 0;
          truck.roadTile = this.depots.get(shipment?.originDepotId)?.roadTile || truck.roadTile;
          if (shipment) shipment.state = 'in_transit';
        } else {
          this._completeDelivery(truck);
          continue;
        }
      }

      const p = pointAtDistance(truck.path, truck.dist);
      truck.worldX = p.x; truck.worldZ = p.z;
      truck.mesh.position.set(p.x, 0, p.z);
      const ahead = pointAtDistance(truck.path, truck.dist + 1.5);
      const angle = Math.atan2(ahead.x - p.x, ahead.z - p.z);
      if (isFinite(angle) && (ahead.x !== p.x || ahead.z !== p.z)) truck.mesh.rotation.y = angle;
    }
  }

  _truckStats(truck, chassis) {
    // Cache per-model computeFreightStats lookups aren't worth the complexity
    // here - the catalog is tiny and this runs once per truck per tick.
    const model = this._modelCache?.get(truck.modelId);
    if (model) return computeFreightStats(model, {});
    return { topSpeed: chassis.baseSpeed * 0.6 }; // fallback if the model was deleted from the catalog
  }

  // Called once from main.js after the catalog is available, so dispatch/
  // movement can look up each truck's real design instead of just its
  // chassis's base numbers. Re-call if the catalog reference ever changes.
  setCatalog(catalog) { this.catalog = catalog; this._modelCache = catalog.models; }

  _completeDelivery(truck) {
    const shipment = this.shipments.get(truck.shipmentId);
    if (shipment) {
      const cargoType = CARGO_TYPES[shipment.cargoTypeId];
      const revenue = Math.round(shipment.tons * cargoType.valuePerTon);
      this.economy.earnFreight?.(revenue);
      const destDepot = this.depots.get(shipment.destDepotId);
      if (destDepot) destDepot.stats.shipmentsDelivered++;
      shipment.state = 'delivered';
      this.shipments.delete(shipment.id);
      this.deliveredCount++;
      this.deliveredTonsByType[shipment.cargoTypeId] = (this.deliveredTonsByType[shipment.cargoTypeId] || 0) + shipment.tons;
    }
    truck.depotId = shipment ? shipment.destDepotId : truck.depotId;
    truck.state = 'idle';
    truck.shipmentId = null;
    truck.phase = null;
    truck.path = null;
  }

  // ---------------- day tick ----------------

  onNewDay() {
    const maintenance = this.depots.size * CARGO_DEPOT_MAINTENANCE_PER_DAY;
    if (maintenance > 0) this.economy.spend(maintenance);
  }

  update(simMinutes) {
    if (!this.catalog) return; // not wired up yet - see setCatalog()
    this._spawnShipments(simMinutes);
    this._decayAndExpire(simMinutes);
    this._dispatchIdleTrucks();
    this._moveTrucks(simMinutes);
  }
}
