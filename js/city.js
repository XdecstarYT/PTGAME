import * as THREE from 'three';
import { GRID_SIZE, TILE_SIZE, ROAD_SPACING, ZONE, ZONE_COLORS, WORLD_SIZE } from './config.js';
import { buildStructureMesh, buildVoxelMesh } from './buildings/buildingMeshBuilder.js';

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

const DEFAULT_SCENARIO = {
  name: 'Sandbox',
  riverAmplitudeMult: 1, riverWidthMult: 1, riverBaseXFrac: 0.66,
  coreRadiusMult: 1, ringRadiusMult: 1,
};

// Park foliage tint per season (js/time.js's TimeSystem.SEASONS) - applied
// live via setSeason() without a full mesh rebuild, the same
// cached-materials-array pattern setWindowGlow() already uses for day/night.
const SEASON_FOLIAGE_COLORS = { Spring: 0x8fd66a, Summer: 0x4f9a4a, Autumn: 0xc9803d, Winter: 0xd8dbd2 };

export class City {
  constructor(seed = Math.floor(Math.random() * 1e9), scenarioConfig = {}) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.size = GRID_SIZE;
    this.tiles = [];
    this.blocks = new Map(); // blockId -> block info
    this.growthRadius = 2.6; // in block-distance units, grows via milestones
    this.scenario = { ...DEFAULT_SCENARIO, ...scenarioConfig };
    this._buildingsGroup = null;
    this.customBuildings = new Map(); // "x_z" -> { x, z, design, group }
    this._customBuildingsGroup = null;
    this._season = 'Summer'; // updated by setSeason(), see main.js's newDay handler

    this._generateGrid();
  }

  // ---------- generation ----------

  _isRoadIndex(i) {
    return i % ROAD_SPACING === 0;
  }

  _riverX(worldZ) {
    const amplitude = TILE_SIZE * 3 * this.scenario.riverAmplitudeMult;
    const freq = (Math.PI * 2) / WORLD_SIZE * 1.4;
    return WORLD_SIZE * this.scenario.riverBaseXFrac + Math.sin(worldZ * freq) * amplitude;
  }

  _riverHalfWidth() {
    return TILE_SIZE * 1.05 * this.scenario.riverWidthMult;
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
        const halfWidth = this._riverHalfWidth();
        const isWater = !isRoad && Math.abs(wx - this._riverX(wz)) < halfWidth;

        let type;
        if (isWater) type = ZONE.WATER;
        else if (isRoad) type = Math.abs(wx - this._riverX(wz)) < halfWidth ? ZONE.BRIDGE : ZONE.ROAD;
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
    const core = 1.5 * this.scenario.coreRadiusMult;
    const ring = 2.6 * this.scenario.ringRadiusMult;
    const outer = 3.6 * this.scenario.ringRadiusMult;
    if (dist < core) {
      if (r < 0.1) return ZONE.LANDMARK;
      if (r < 0.75) return ZONE.COMMERCIAL;
      return ZONE.RESIDENTIAL;
    } else if (dist < ring) {
      if (r < 0.65) return ZONE.RESIDENTIAL;
      if (r < 0.9) return ZONE.COMMERCIAL;
      return ZONE.INDUSTRIAL;
    } else if (dist < outer) {
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

  // Rebuilds the same deterministic layout from a saved seed, then re-applies
  // which blocks had unlocked/matured so a loaded game looks like it did
  // when it was saved.
  regenerateFromSave(seed, growthRadius, blockStates, scenarioConfig) {
    this._clearCustomBuildings();
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.tiles = [];
    this.blocks = new Map();
    this.growthRadius = growthRadius;
    if (scenarioConfig) this.scenario = { ...DEFAULT_SCENARIO, ...scenarioConfig };
    this._generateGrid();
    for (const state of blockStates || []) {
      const block = this.blocks.get(state.id);
      if (!block) continue;
      block.unlocked = state.unlocked;
      block.maturity = state.maturity;
      if (block.unlocked) {
        for (const tile of block.tiles) {
          if (tile.type === ZONE.EMPTY) {
            tile.type = this._pickTileType(block.dominantType);
            if (tile.type === ZONE.RESIDENTIAL) tile.population = Math.round(24 + this.rng() * 46);
            if (tile.type === ZONE.COMMERCIAL) tile.jobs = Math.round(20 + this.rng() * 55);
            if (tile.type === ZONE.INDUSTRIAL) tile.jobs = Math.round(18 + this.rng() * 40);
            if (tile.type === ZONE.LANDMARK) tile.jobs = Math.round(10 + this.rng() * 15);
          }
        }
      }
    }
    this.rebuildMeshes();
  }

  // Starts a brand-new city from a hand-authored scenario preset (or the
  // default sandbox config if scenarioConfig is empty).
  regenerateWithScenario(seed, scenarioConfig = {}) {
    this._clearCustomBuildings();
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.scenario = { ...DEFAULT_SCENARIO, ...scenarioConfig };
    this.tiles = [];
    this.blocks = new Map();
    this.growthRadius = 2.6;
    this._generateGrid();
    this.rebuildMeshes();
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

  // ---------- custom (player-built) buildings ----------

  canPlaceCustomBuilding(x, z) {
    if (!this.inBounds(x, z)) return { ok: false, reason: 'Out of bounds.' };
    if (!this.isBuildable(x, z)) return { ok: false, reason: 'Pick a developed residential, commercial, industrial, or landmark tile.' };
    if (this.customBuildings.has(`${x}_${z}`)) return { ok: false, reason: 'This tile already has a custom building on it.' };
    return { ok: true };
  }

  // Drops a saved Building Creator design onto a city tile, replacing the
  // procedural building there. The tile keeps its zone type/population/jobs -
  // only the visible building mesh is swapped for the player's own design.
  placeCustomBuilding(x, z, design) {
    const key = `${x}_${z}`;
    const existing = this.customBuildings.get(key);
    if (existing) this._disposeCustomBuilding(existing);

    const wrapper = new THREE.Group();
    wrapper.add(buildStructureMesh(design));
    wrapper.add(buildVoxelMesh(design));
    const center = this.tileCenterWorld(x, z);
    wrapper.position.set(center.x, 0, center.z);

    const entry = { x, z, design, group: wrapper };
    this.customBuildings.set(key, entry);
    this._customBuildingsGroup.add(wrapper);
    this.rebuildMeshes(); // re-batch procedural buildings, excluding this tile
    return entry;
  }

  removeCustomBuilding(x, z) {
    const key = `${x}_${z}`;
    const entry = this.customBuildings.get(key);
    if (!entry) return;
    this._disposeCustomBuilding(entry);
    this.customBuildings.delete(key);
    this.rebuildMeshes();
  }

  _disposeCustomBuilding(entry) {
    this._customBuildingsGroup.remove(entry.group);
    entry.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }

  _clearCustomBuildings() {
    if (this._customBuildingsGroup) {
      for (const entry of this.customBuildings.values()) this._disposeCustomBuilding(entry);
    }
    this.customBuildings.clear();
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
    this._customBuildingsGroup = new THREE.Group();
    this.scene.add(this._customBuildingsGroup);
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

    // Lots get a small gap between tile pads so buildings read as separated
    // parcels; roads/bridges use a full-size (slightly overlapping) pad so
    // adjacent road tiles form one continuous connected surface instead of
    // visibly separate squares.
    const padGeo = new THREE.BoxGeometry(TILE_SIZE * 0.94, 0.2, TILE_SIZE * 0.94);
    const roadPadGeo = new THREE.BoxGeometry(TILE_SIZE * 1.02, 0.2, TILE_SIZE * 1.02);
    for (const [type, tiles] of Object.entries(byType)) {
      const color = ZONE_COLORS[type] ?? 0x888888;
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
      const isRoadLike = type === ZONE.ROAD || type === ZONE.BRIDGE;
      const mesh = new THREE.InstancedMesh(isRoadLike ? roadPadGeo : padGeo, mat, tiles.length);
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
    const roofBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const roofConeGeo = new THREE.ConeGeometry(0.5, 1, 6);
    const windowGeo = new THREE.BoxGeometry(1, 1, 1);
    const plinthGeo = new THREE.BoxGeometry(1, 1, 1);
    const accessoryBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const accessoryCylGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    this._windowMats = [];
    this._foliageMats = [];
    this._streetlightMats = [];

    for (const type of buildingTypes) {
      const tiles = (byType[type] || []).filter(t => !this.customBuildings.has(`${t.x}_${t.z}`));
      if (!tiles.length) continue;
      const color = ZONE_COLORS[type];
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
      const mesh = new THREE.InstancedMesh(geo, mat, tiles.length);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const roofMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true });
      roofMat.color.multiplyScalar(0.8);
      const roofGeo = type === ZONE.LANDMARK ? roofConeGeo : roofBoxGeo;
      const roofMesh = new THREE.InstancedMesh(roofGeo, roofMat, tiles.length);
      roofMesh.castShadow = true;

      const windowMat = new THREE.MeshStandardMaterial({
        color: 0x0c1420, roughness: 0.3, metalness: 0.2,
        emissive: 0xffdb8a, emissiveIntensity: 0,
      });
      this._windowMats.push(windowMat);
      const windowMesh = new THREE.InstancedMesh(windowGeo, windowMat, tiles.length);

      // A darker, slightly wider foundation strip so buildings look
      // grounded instead of floating on the tile pad.
      const plinthMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
      plinthMat.color.multiplyScalar(0.55);
      const plinthMesh = new THREE.InstancedMesh(plinthGeo, plinthMat, tiles.length);
      plinthMesh.receiveShadow = true;

      // A rooftop accessory whose shape reads as the zone type: a chimney
      // for residential, an AC unit for commercial, a water tower for
      // industrial, an antenna spike for landmarks.
      const accessoryMat = new THREE.MeshStandardMaterial({
        color: type === ZONE.INDUSTRIAL ? 0x9a9a94 : (type === ZONE.RESIDENTIAL ? 0x5a4a3a : 0xc9ccd1),
        roughness: 0.6, metalness: type === ZONE.LANDMARK ? 0.5 : 0.1,
      });
      const accessoryGeo = type === ZONE.INDUSTRIAL || type === ZONE.LANDMARK ? accessoryCylGeo : accessoryBoxGeo;
      const accessoryMesh = new THREE.InstancedMesh(accessoryGeo, accessoryMat, tiles.length);
      accessoryMesh.castShadow = true;

      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const s = new THREE.Vector3();
      const jitterColor = new THREE.Color();
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
        const rotY = t.seed * Math.PI * 0.5;
        const cx = t.worldX + jitterX, cz = t.worldZ + jitterZ;

        s.set(footprint, h, footprint);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
        m.compose(new THREE.Vector3(cx, h / 2, cz), q, s);
        mesh.setMatrixAt(i, m);

        // Subtle per-building tint so a whole zone isn't one flat color.
        const tintAmt = ((t.seed * 13) % 1 - 0.5) * 0.3;
        jitterColor.setScalar(1 + tintAmt);
        mesh.setColorAt(i, jitterColor);

        // Roof cap - shape/proportions vary by zone type for a distinct
        // per-type roofline silhouette instead of a flat-topped box.
        let roofTopY;
        if (type === ZONE.LANDMARK) {
          const spireH = h * 0.35;
          s.set(footprint * 0.55, spireH, footprint * 0.55);
          m.compose(new THREE.Vector3(cx, h + spireH / 2, cz), q, s);
          roofTopY = h + spireH;
        } else if (type === ZONE.COMMERCIAL) {
          const tierH = h * 0.16;
          s.set(footprint * 0.55, tierH, footprint * 0.55);
          m.compose(new THREE.Vector3(cx, h + tierH / 2, cz), q, s);
          roofTopY = h + tierH;
        } else if (type === ZONE.INDUSTRIAL) {
          const ventH = footprint * 0.18;
          s.set(footprint * 0.22, ventH, footprint * 0.22);
          m.compose(new THREE.Vector3(cx + footprint * 0.22, h + ventH / 2, cz + footprint * 0.22), q, s);
          roofTopY = h;
        } else {
          const capH = 0.15;
          s.set(footprint * 1.08, capH, footprint * 1.08);
          m.compose(new THREE.Vector3(cx, h + capH / 2, cz), q, s);
          roofTopY = h + capH;
        }
        roofMesh.setMatrixAt(i, m);

        // Foundation plinth - a short, darker, slightly wider base ring.
        const plinthH = Math.min(0.5, h * 0.15);
        s.set(footprint * 1.1, plinthH, footprint * 1.1);
        m.compose(new THREE.Vector3(cx, plinthH / 2, cz), q, s);
        plinthMesh.setMatrixAt(i, m);

        // Rooftop accessory - chimney / AC unit / water tower / antenna.
        if (type === ZONE.LANDMARK) {
          const antH = footprint * 0.5;
          s.set(footprint * 0.05, antH, footprint * 0.05);
          m.compose(new THREE.Vector3(cx, roofTopY + antH / 2, cz), q, s);
        } else if (type === ZONE.INDUSTRIAL) {
          const tankH = footprint * 0.4;
          s.set(footprint * 0.3, tankH, footprint * 0.3);
          m.compose(new THREE.Vector3(cx - footprint * 0.22, roofTopY + tankH / 2, cz - footprint * 0.22), q, s);
        } else if (type === ZONE.COMMERCIAL) {
          const acH = footprint * 0.14;
          s.set(footprint * 0.25, acH, footprint * 0.2);
          m.compose(new THREE.Vector3(cx, roofTopY + acH / 2, cz), q, s);
        } else {
          const chimH = footprint * 0.3;
          s.set(footprint * 0.12, chimH, footprint * 0.12);
          m.compose(new THREE.Vector3(cx + footprint * 0.3, roofTopY + chimH / 2, cz + footprint * 0.3), q, s);
        }
        accessoryMesh.setMatrixAt(i, m);

        // Window band - a single wrap-around strip per building, lit at
        // night via city.setWindowGlow() (see main.js's day/night tick).
        const bandH = Math.min(h * 0.22, 1.6);
        s.set(footprint * 1.01, bandH, footprint * 1.01);
        m.compose(new THREE.Vector3(cx, h * 0.62, cz), q, s);
        windowMesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      plinthMesh.instanceMatrix.needsUpdate = true;
      accessoryMesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      roofMesh.instanceMatrix.needsUpdate = true;
      windowMesh.instanceMatrix.needsUpdate = true;
      group.add(mesh, roofMesh, windowMesh, plinthMesh, accessoryMesh);
    }

    // Park greenery - the one zone type that previously had nothing sitting
    // on top of its ground pad. A couple of low-poly trees per tile, tinted
    // by the current season (see setSeason()) and lit as normal (no
    // day/night hook needed - unlike windows/streetlights, foliage doesn't
    // emit light).
    const parkTiles = byType[ZONE.PARK] || [];
    if (parkTiles.length) {
      const treesPerTile = 2;
      const trunkGeo = new THREE.CylinderGeometry(1, 1.2, 1, 6);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
      const foliageGeo = new THREE.IcosahedronGeometry(1, 0);
      const foliageMat = new THREE.MeshStandardMaterial({
        color: SEASON_FOLIAGE_COLORS[this._season] ?? SEASON_FOLIAGE_COLORS.Summer,
        roughness: 0.85, flatShading: true,
      });
      this._foliageMats.push(foliageMat);

      const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, parkTiles.length * treesPerTile);
      const foliageMesh = new THREE.InstancedMesh(foliageGeo, foliageMat, parkTiles.length * treesPerTile);
      trunkMesh.castShadow = true; trunkMesh.receiveShadow = true;
      foliageMesh.castShadow = true;

      const tm = new THREE.Matrix4();
      const identityQ = new THREE.Quaternion();
      let idx = 0;
      for (const t of parkTiles) {
        for (let k = 0; k < treesPerTile; k++) {
          const treeSeed = (t.seed * (k + 3.1)) % 1;
          const trunkH = 1.6 + treeSeed * 1.2;
          const trunkR = 0.18 + treeSeed * 0.08;
          const angle = (k / treesPerTile) * Math.PI * 2 + t.seed * Math.PI * 2;
          const radius = TILE_SIZE * 0.22;
          const tx = t.worldX + Math.cos(angle) * radius;
          const tz = t.worldZ + Math.sin(angle) * radius;

          tm.compose(new THREE.Vector3(tx, trunkH / 2, tz), identityQ, new THREE.Vector3(trunkR, trunkH, trunkR));
          trunkMesh.setMatrixAt(idx, tm);

          const canopyR = 1.1 + treeSeed * 0.6;
          tm.compose(new THREE.Vector3(tx, trunkH + canopyR * 0.7, tz), identityQ, new THREE.Vector3(canopyR, canopyR, canopyR));
          foliageMesh.setMatrixAt(idx, tm);
          idx++;
        }
      }
      trunkMesh.instanceMatrix.needsUpdate = true;
      foliageMesh.instanceMatrix.needsUpdate = true;
      group.add(trunkMesh, foliageMesh);
    }

    // Streetlights along roads - spaced every other road tile (a checkerboard
    // pick) so streets read as lit without a lamp on literally every tile.
    // The lamp head glows at night via setStreetlightGlow() (see main.js's
    // day/night tick, called alongside setWindowGlow()).
    const litRoadTiles = (byType[ZONE.ROAD] || []).filter(t => (t.x + t.z) % 2 === 0);
    if (litRoadTiles.length) {
      const poleH = 5;
      const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 6);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.6, metalness: 0.3 });
      const lampGeo = new THREE.SphereGeometry(1, 8, 6);
      const lampMat = new THREE.MeshStandardMaterial({
        color: 0xfff3c9, emissive: 0xfff3c9, emissiveIntensity: 0, roughness: 0.4,
      });
      this._streetlightMats.push(lampMat);

      const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, litRoadTiles.length);
      const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, litRoadTiles.length);
      poleMesh.castShadow = true;

      const lm = new THREE.Matrix4();
      const identityQ2 = new THREE.Quaternion();
      litRoadTiles.forEach((t, i) => {
        const cornerX = t.worldX + TILE_SIZE * 0.4;
        const cornerZ = t.worldZ + TILE_SIZE * 0.4;
        lm.compose(new THREE.Vector3(cornerX, poleH / 2, cornerZ), identityQ2, new THREE.Vector3(1, poleH, 1));
        poleMesh.setMatrixAt(i, lm);
        lm.compose(new THREE.Vector3(cornerX, poleH + 0.25, cornerZ), identityQ2, new THREE.Vector3(0.35, 0.35, 0.35));
        lampMesh.setMatrixAt(i, lm);
      });
      poleMesh.instanceMatrix.needsUpdate = true;
      lampMesh.instanceMatrix.needsUpdate = true;
      group.add(poleMesh, lampMesh);
    }

    this.scene.add(group);
  }

  // hour in [0,24) - call alongside SceneManager.setTimeOfDay so lit
  // building windows track the same day/night cycle.
  setWindowGlow(hour) {
    if (!this._windowMats) return;
    const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
    const dayness = Math.max(0, Math.sin(angle));
    const glow = Math.max(0, 0.9 - dayness * 1.1);
    for (const mat of this._windowMats) mat.emissiveIntensity = glow;
  }

  // Same day/night formula as setWindowGlow(), just brighter (streetlights
  // read as small point-like bulbs rather than a big glowing window band) -
  // call alongside it from the same tick.
  setStreetlightGlow(hour) {
    if (!this._streetlightMats) return;
    const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
    const dayness = Math.max(0, Math.sin(angle));
    const glow = Math.max(0, 1.1 - dayness * 1.3);
    for (const mat of this._streetlightMats) mat.emissiveIntensity = glow;
  }

  // season is one of TimeSystem.SEASONS ('Spring'|'Summer'|'Autumn'|'Winter')
  // - recolors park foliage without a full mesh rebuild. Also stashes the
  // season so a later rebuildMeshes() (tier upgrade, custom building, etc)
  // starts new foliage materials off in the right color instead of
  // defaulting back to Summer.
  setSeason(season) {
    this._season = season;
    if (!this._foliageMats) return;
    const color = SEASON_FOLIAGE_COLORS[season] ?? SEASON_FOLIAGE_COLORS.Summer;
    for (const mat of this._foliageMats) mat.color.setHex(color);
  }
}
