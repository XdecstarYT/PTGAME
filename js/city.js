import * as THREE from 'three';
import { GRID_SIZE, TILE_SIZE, ROAD_SPACING, ZONE, ZONE_COLORS, WORLD_SIZE } from './config.js';

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Procedural low-poly city: a grid of zoned tiles cut by roads and a river.
// Population/jobs drive passenger demand; growthRadius gates which blocks are
// "active" so the city can visibly expand over the course of a playthrough.

export class City {
  constructor(seed = Math.floor(Math.random() * 1e9)) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.size = GRID_SIZE;
    this.tiles = [];
    this.blocks = new Map(); // blockId -> block info
    this.growthRadius = 2.6; // in block-distance units, grows via milestones
    this._buildingsGroup = null;

    this._generateGrid();
  }

  // ---------- generation ----------

  _isRoadIndex(i) {
    return i % ROAD_SPACING === 0;
  }

  _riverX(worldZ) {
    const amplitude = TILE_SIZE * 3;
    const freq = (Math.PI * 2) / WORLD_SIZE * 1.4;
    return WORLD_SIZE * 0.66 + Math.sin(worldZ * freq) * amplitude;
  }

  _generateGrid() {
    const n = this.size;
    for (let x = 0; x < n; x++) this.tiles.push(new Array(n));

    // 1. lay down roads vs buildable tiles, assign block ids
    const blocksPerSide = Math.ceil(n / ROAD_SPACING);
    const center = (blocksPerSide - 1) / 2;

    for (let bx = 0; bx < blocksPerSide; bx++) {
      for (let bz = 0; bz < blocksPerSide; bz++) {
        const dx = bx - center, dz = bz - center;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const blockId = `${bx}_${bz}`;
        this.blocks.set(blockId, {
          id: blockId, bx, bz, dist,
          dominantType: this._pickBlockType(dist),
          unlocked: dist <= this.growthRadius,
          maturity: dist <= this.growthRadius ? 1 : 0,
          tiles: [],
        });
      }
    }

    // force a landmark block near the core for variety
    const coreBlock = this.blocks.get(`${Math.round(center)}_${Math.round(center)}`);
    if (coreBlock) coreBlock.dominantType = ZONE.LANDMARK;

    for (let x = 0; x < n; x++) {
      for (let z = 0; z < n; z++) {
        const isRoad = this._isRoadIndex(x) || this._isRoadIndex(z);
        const bx = Math.floor(x / ROAD_SPACING);
        const bz = Math.floor(z / ROAD_SPACING);
        const blockId = `${bx}_${bz}`;
        const block = this.blocks.get(blockId);

        const wx = (x + 0.5) * TILE_SIZE;
        const wz = (z + 0.5) * TILE_SIZE;
        const isWater = !isRoad && Math.abs(wx - this._riverX(wz)) < TILE_SIZE * 1.05;

        let type;
        if (isWater) type = ZONE.WATER;
        else if (isRoad) type = Math.abs(wx - this._riverX(wz)) < TILE_SIZE * 1.05 ? ZONE.BRIDGE : ZONE.ROAD;
        else if (!block.unlocked) type = ZONE.EMPTY;
        else type = this._pickTileType(block.dominantType);

        const tile = {
          x, z, blockId, type,
          worldX: wx, worldZ: wz,
          population: 0, jobs: 0,
          height: 0, seed: this.rng(),
        };

        if (type === ZONE.RESIDENTIAL) tile.population = Math.round(24 + this.rng() * 46);
        if (type === ZONE.COMMERCIAL) tile.jobs = Math.round(20 + this.rng() * 55);
        if (type === ZONE.INDUSTRIAL) tile.jobs = Math.round(18 + this.rng() * 40);
        if (type === ZONE.LANDMARK) tile.jobs = Math.round(10 + this.rng() * 15);

        this.tiles[x][z] = tile;
        block.tiles.push(tile);
      }
    }
  }

  _pickBlockType(dist) {
    const r = this.rng();
    if (dist < 1.5) {
      if (r < 0.1) return ZONE.LANDMARK;
      if (r < 0.75) return ZONE.COMMERCIAL;
      return ZONE.RESIDENTIAL;
    } else if (dist < 2.6) {
      if (r < 0.65) return ZONE.RESIDENTIAL;
      if (r < 0.9) return ZONE.COMMERCIAL;
      return ZONE.INDUSTRIAL;
    } else if (dist < 3.6) {
      if (r < 0.4) return ZONE.RESIDENTIAL;
      if (r < 0.8) return ZONE.INDUSTRIAL;
      return ZONE.COMMERCIAL;
    }
    if (r < 0.5) return ZONE.INDUSTRIAL;
    if (r < 0.85) return ZONE.RESIDENTIAL;
    return ZONE.PARK;
  }

  _pickTileType(dominant) {
    // sprinkle a little variety within a block rather than 100% uniform
    const r = this.rng();
    if (dominant === ZONE.LANDMARK) return r < 0.55 ? ZONE.LANDMARK : ZONE.COMMERCIAL;
    if (r < 0.78) return dominant;
    const alts = [ZONE.RESIDENTIAL, ZONE.COMMERCIAL, ZONE.INDUSTRIAL, ZONE.PARK];
    return alts[Math.floor(this.rng() * alts.length)];
  }

  // ---------- growth ----------

  unlockNextRing() {
    const locked = [...this.blocks.values()].filter(b => !b.unlocked);
    if (locked.length === 0) return false;
    locked.sort((a, b) => a.dist - b.dist);
    const nextDist = locked[0].dist;
    this.growthRadius = nextDist + 0.01;
    let changed = false;
    for (const block of this.blocks.values()) {
      if (!block.unlocked && block.dist <= this.growthRadius) {
        block.unlocked = true;
        block.maturity = 0.02;
        for (const tile of block.tiles) {
          if (tile.type === ZONE.EMPTY) {
            tile.type = this._pickTileType(block.dominantType);
            if (tile.type === ZONE.RESIDENTIAL) tile.population = Math.round(24 + this.rng() * 46);
            if (tile.type === ZONE.COMMERCIAL) tile.jobs = Math.round(20 + this.rng() * 55);
            if (tile.type === ZONE.INDUSTRIAL) tile.jobs = Math.round(18 + this.rng() * 40);
            if (tile.type === ZONE.LANDMARK) tile.jobs = Math.round(10 + this.rng() * 15);
          }
        }
        changed = true;
      }
    }
    if (changed) this.rebuildMeshes();
    return changed;
  }

  get percentUnlocked() {
    const all = [...this.blocks.values()];
    return all.filter(b => b.unlocked).length / all.length;
  }

  // grows maturity of recently-unlocked blocks toward 1 over a few sim-days
  update(simMinutes) {
    const days = simMinutes / 1440;
    for (const block of this.blocks.values()) {
      if (block.unlocked && block.maturity < 1) {
        block.maturity = Math.min(1, block.maturity + days / 3);
      }
    }
  }

  effectivePopulation(tile) {
    const block = this.blocks.get(tile.blockId);
    return tile.population * (block ? block.maturity : 1);
  }

  effectiveJobs(tile) {
    const block = this.blocks.get(tile.blockId);
    return tile.jobs * (block ? block.maturity : 1);
  }

  // ---------- queries ----------

  inBounds(x, z) { return x >= 0 && z >= 0 && x < this.size && z < this.size; }

  tileAt(x, z) { return this.inBounds(x, z) ? this.tiles[x][z] : null; }

  worldToTile(wx, wz) {
    return { x: Math.floor(wx / TILE_SIZE), z: Math.floor(wz / TILE_SIZE) };
  }

  tileCenterWorld(x, z) {
    return new THREE.Vector3((x + 0.5) * TILE_SIZE, 0, (z + 0.5) * TILE_SIZE);
  }

  isRoad(x, z) {
    const t = this.tileAt(x, z);
    return !!t && (t.type === ZONE.ROAD || t.type === ZONE.BRIDGE);
  }

  isBuildable(x, z) {
    const t = this.tileAt(x, z);
    if (!t) return false;
    return [ZONE.RESIDENTIAL, ZONE.COMMERCIAL, ZONE.INDUSTRIAL, ZONE.LANDMARK].includes(t.type);
  }

  nearestRoadTile(x, z, maxRadius = 3) {
    for (let r = 0; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.isRoad(x + dx, z + dz)) return { x: x + dx, z: z + dz };
        }
      }
    }
    return null;
  }

  demandZones() {
    const residential = [], jobsZones = [];
    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
        const t = this.tiles[x][z];
        if (t.type === ZONE.RESIDENTIAL && this.effectivePopulation(t) > 1) residential.push(t);
        if ((t.type === ZONE.COMMERCIAL || t.type === ZONE.INDUSTRIAL || t.type === ZONE.LANDMARK) && this.effectiveJobs(t) > 1) jobsZones.push(t);
      }
    }
    return { residential, jobsZones };
  }

  // ---------- rendering ----------

  buildMeshes(scene) {
    this.scene = scene;
    this.rebuildMeshes();
  }

  rebuildMeshes() {
    if (this._buildingsGroup) {
      this.scene.remove(this._buildingsGroup);
      this._buildingsGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    const group = new THREE.Group();
    this._buildingsGroup = group;

    // ground plane
    const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x4d5a3f, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(WORLD_SIZE / 2, -0.05, WORLD_SIZE / 2);
    ground.receiveShadow = true;
    group.add(ground);

    // per-tile base pads, batched by type for a handful of draw calls
    const byType = {};
    for (let x = 0; x < this.size; x++) {
      for (let z = 0; z < this.size; z++) {
        const t = this.tiles[x][z];
        (byType[t.type] ||= []).push(t);
      }
    }

    const padGeo = new THREE.BoxGeometry(TILE_SIZE * 0.94, 0.2, TILE_SIZE * 0.94);
    for (const [type, tiles] of Object.entries(byType)) {
      const color = ZONE_COLORS[type] ?? 0x888888;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
      const mesh = new THREE.InstancedMesh(padGeo, mat, tiles.length);
      mesh.receiveShadow = true;
      const m = new THREE.Matrix4();
      tiles.forEach((t, i) => {
        const y = type === ZONE.WATER ? -0.35 : (type === ZONE.BRIDGE ? 0.15 : 0.02);
        m.makeTranslation(t.worldX, y, t.worldZ);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }

    // buildings for zoned tiles
    const buildingTypes = [ZONE.RESIDENTIAL, ZONE.COMMERCIAL, ZONE.INDUSTRIAL, ZONE.LANDMARK];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (const type of buildingTypes) {
      const tiles = (byType[type] || []);
      if (!tiles.length) continue;
      const color = ZONE_COLORS[type];
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
      const mesh = new THREE.InstancedMesh(geo, mat, tiles.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      tiles.forEach((t, i) => {
        const block = this.blocks.get(t.blockId);
        const maturity = block ? block.maturity : 1;
        let baseH;
        if (type === ZONE.RESIDENTIAL) baseH = 4 + t.seed * 6;
        else if (type === ZONE.COMMERCIAL) baseH = 8 + t.seed * 20;
        else if (type === ZONE.INDUSTRIAL) baseH = 5 + t.seed * 6;
        else baseH = 16 + t.seed * 18; // landmark

        const h = Math.max(0.6, baseH * maturity);
        const footprint = TILE_SIZE * (0.42 + t.seed * 0.18);
        const jitterX = (t.seed - 0.5) * TILE_SIZE * 0.25;
        const jitterZ = ((t.seed * 7) % 1 - 0.5) * TILE_SIZE * 0.25;
        s.set(footprint, h, footprint);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.seed * Math.PI * 0.5);
        m.compose(new THREE.Vector3(t.worldX + jitterX, h / 2, t.worldZ + jitterZ), q, s);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }

    this.scene.add(group);
  }
}
