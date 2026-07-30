import * as THREE from 'three';
import {
  CELL_SIZE, SIZE_TIERS, STATION_TYPES, stationType, ACCESS_TOLERANCE_CELLS,
} from './config.js';
import { buildStationShell } from './architecture.js';

const FEATURE_FOR_RULE = {
  road: ['road'],
  tunnel: ['tunnel'],
  rail: ['rail'],
  water: ['water'],
  any: ['road', 'tunnel', 'rail', 'water'],
};

let _stationIdCounter = 1;

// Owns footprint ghost-preview, access-rule validation, and confirmed
// placement of stations onto the world grid. Each placed station is a plain
// data record (see confirmPlacement) plus a simple placeholder 3D mesh -
// the layout editor (Phase 2) is what actually fills a station's interior.
export class PlacementSystem {
  constructor({ scene, world, economy }) {
    this.scene = scene;
    this.world = world;
    this.economy = economy;
    this.stations = [];

    this.typeId = STATION_TYPES[0].id;
    this.tierId = SIZE_TIERS[0].id;
    this.rotated = false; // swaps w/d when true

    this.hover = null; // { x, z, w, d, valid, reason }
    this._buildGhost();
  }

  setType(id) { this.typeId = id; }
  setTier(id) { this.tierId = id; }
  toggleRotate() { this.rotated = !this.rotated; }

  get currentType() { return stationType(this.typeId); }
  get currentTier() { return SIZE_TIERS.find(t => t.id === this.tierId); }

  footprintSize() {
    const tier = this.currentTier;
    return this.rotated ? { w: tier.d, d: tier.w } : { w: tier.w, d: tier.d };
  }

  currentCost() {
    const tier = this.currentTier;
    const type = this.currentType;
    return Math.round(tier.w * tier.d * type.costPerCell * tier.costMult);
  }

  _buildGhost() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0x33cc66, transparent: true, opacity: 0.45 });
    this.ghostMesh = new THREE.Mesh(geo, mat);
    this.ghostMesh.visible = false;
    this.scene.add(this.ghostMesh);

    const edges = new THREE.EdgesGeometry(geo);
    this.ghostOutline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff }));
    this.ghostMesh.add(this.ghostOutline);
  }

  // point: world-space THREE.Vector3 from a ground raycast, or null if the
  // cursor isn't over the ground plane.
  updateGhost(point) {
    if (!point) { this.ghostMesh.visible = false; this.hover = null; return; }
    const { w, d } = this.footprintSize();
    // Anchor the footprint so it's centered under the cursor, then snap.
    const gx = Math.round(point.x / CELL_SIZE - w / 2);
    const gz = Math.round(point.z / CELL_SIZE - d / 2);

    const { valid, reason } = this._validate(gx, gz, w, d);
    this.hover = { x: gx, z: gz, w, d, valid, reason };

    const worldX = (gx + w / 2) * CELL_SIZE;
    const worldZ = (gz + d / 2) * CELL_SIZE;
    const height = 3.2;
    this.ghostMesh.scale.set(w * CELL_SIZE, height, d * CELL_SIZE);
    this.ghostMesh.position.set(worldX, height / 2, worldZ);
    this.ghostMesh.material.color.set(valid ? 0x33cc66 : 0xcc3333);
    this.ghostMesh.visible = true;
  }

  _validate(gx, gz, w, d) {
    if (gx < 0 || gz < 0 || gx + w > this.world.size || gz + d > this.world.size) {
      return { valid: false, reason: 'Footprint extends outside the map.' };
    }
    for (const s of this.stations) {
      const overlap = gx < s.x + s.w && gx + w > s.x && gz < s.z + s.d && gz + d > s.z;
      if (overlap) return { valid: false, reason: 'Overlaps an existing station.' };
    }
    const type = this.currentType;
    const features = FEATURE_FOR_RULE[type.accessRule] || [];
    let nearestDist = Infinity;
    for (let x = gx; x < gx + w; x++) {
      for (let z = gz; z < gz + d; z++) {
        for (const f of features) {
          const dist = this.world.distanceToNearest(x, z, f, ACCESS_TOLERANCE_CELLS + 1);
          if (dist < nearestDist) nearestDist = dist;
        }
      }
    }
    if (nearestDist > ACCESS_TOLERANCE_CELLS) {
      const need = { road: 'a road', tunnel: 'a subway tunnel portal', rail: 'a rail corridor', water: 'the waterfront', any: 'a road, rail line, tunnel portal or waterfront' }[type.accessRule];
      return { valid: false, reason: `Needs to be near ${need}.` };
    }
    return { valid: true, reason: null };
  }

  canAffordCurrent() {
    return this.economy.budget >= this.currentCost();
  }

  // Attempts to place a station at the current hover location. Returns the
  // created station record, or null (with a reason) if placement failed.
  confirmPlacement() {
    if (!this.hover) return { ok: false, reason: 'Move over the map first.' };
    if (!this.hover.valid) return { ok: false, reason: this.hover.reason };
    const cost = this.currentCost();
    if (this.economy.budget < cost) return { ok: false, reason: `Not enough budget (need $${cost.toLocaleString()}).` };

    this.economy.budget -= cost;
    const type = this.currentType;
    const tier = this.currentTier;
    const { x, z, w, d } = this.hover;
    const station = {
      id: `st${_stationIdCounter++}`,
      typeId: type.id,
      tierId: tier.id,
      name: `${type.name} ${_stationIdCounter - 1}`,
      x, z, w, d,
      rotated: this.rotated,
      cost,
      levels: [], // filled in by the layout editor (Phase 2)
    };
    station.mesh = this._buildStationMesh(station);
    this.scene.add(station.mesh);
    this.stations.push(station);
    return { ok: true, station };
  }

  _buildStationMesh(station) {
    const type = stationType(station.typeId);
    const group = new THREE.Group();
    const worldX = (station.x + station.w / 2) * CELL_SIZE;
    const worldZ = (station.z + station.d / 2) * CELL_SIZE;
    const footprintW = station.w * CELL_SIZE;
    const footprintD = station.d * CELL_SIZE;

    const padGeo = new THREE.BoxGeometry(footprintW, 0.3, footprintD);
    const pad = new THREE.Mesh(padGeo, new THREE.MeshStandardMaterial({ color: type.color }));
    pad.position.set(worldX, 0.15, worldZ);
    pad.castShadow = true;
    pad.receiveShadow = true;
    group.add(pad);

    // Type-specific architecture (shelter/pavilion/hall) sized to the
    // footprint - see architecture.js.
    const shell = buildStationShell(station.typeId, station.tierId, footprintW, footprintD);
    shell.position.set(worldX, 0.3, worldZ);
    shell.traverse(m => { if (m.isMesh) m.receiveShadow = true; });
    group.add(shell);

    return group;
  }

  removeStation(id) {
    const i = this.stations.findIndex(s => s.id === id);
    if (i < 0) return;
    this.scene.remove(this.stations[i].mesh);
    this.stations.splice(i, 1);
  }
}
