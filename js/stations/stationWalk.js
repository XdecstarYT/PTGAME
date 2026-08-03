import * as THREE from 'three';
import { LAYOUT_CELL_SIZE, stationInteriorObject } from './stationDefs.js';
import { StationCrowdPreview } from './stationCrowdPreview.js';
import { buildStationInteriorGroup, interiorOrigin } from './stationMeshBuilder.js';
import { computeStationStats } from './stationStatEngine.js';

const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.35;
const MOVE_SPEED = 3.2; // m/s

// First-person walkable inspection mode for the in-game Station Designer -
// same pointer-lock + WASD + grid-collision approach as the standalone
// station-builder tool's walkMode.js (station-builder/js/walkMode.js) and
// the vehicle designer's InteriorWalkController (js/designer/interiorWalk.js),
// adapted to a station design's per-level grid. The "futuristic" architecture
// style additionally gets a real glass-canopy-vault ceiling with green ribs
// and ad posters, matching the exterior shell's look from the inside.
export class StationWalkController {
  constructor({ scene, onExit }) {
    this.scene = scene; // a StationScene instance
    this.onExit = onExit || (() => {});
    this.active = false;
    this.design = null;
    this.levelIndex = 0;
    this.group = null;
    this.crowd = null;

    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();

    this._wireInput();
  }

  _wireInput() {
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      this.keys.add(e.code);
      if (e.code === 'Escape') this.exit();
      if (e.code === 'KeyE') this._tryLevelTransition(1);
      if (e.code === 'KeyQ') this._tryLevelTransition(-1);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    const canvas = this.scene.canvas;
    canvas.addEventListener('click', () => {
      if (this.active && document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.active || document.pointerLockElement !== canvas) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch));
    });
  }

  enter(design, levelIndex = 0) {
    this.design = design;
    this.levelIndex = Math.min(levelIndex, design.levels.length - 1);
    this.active = true;
    // Hide the small outdoor exterior shell while walking - it shares this
    // same scene/origin as the full-size interior room being built below,
    // and the futuristic canopy's glass is double-sided (visible from both
    // faces) so it would otherwise show through as a stray duplicate roof.
    if (this.scene.stationGroup) this.scene.stationGroup.visible = false;
    this._rebuild();
    this._placeAtEntrance();
    this.scene.controls.enabled = false;
  }

  exit() {
    this.active = false;
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.group) { this.scene.scene.remove(this.group); this._disposeGroup(this.group); this.group = null; }
    if (this.crowd) { this.crowd.dispose(this.scene.scene); this.crowd = null; }
    if (this.scene.stationGroup) this.scene.stationGroup.visible = true;
    this.scene.controls.enabled = true;
    this.onExit();
  }

  _disposeGroup(group) {
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }

  // ---------------- grid <-> world ----------------

  _grid() { return this.design.levels[this.levelIndex].grid; }

  _origin() { return interiorOrigin(this.design, this.levelIndex); }

  _cellWalkable(r, c) {
    const grid = this._grid();
    if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length) return false;
    const obj = stationInteriorObject(grid[r][c]);
    return !obj || obj.walkable !== false;
  }

  _worldToLocalCell(worldX, worldZ) {
    const o = this._origin();
    return { c: Math.floor((worldX - o.x) / LAYOUT_CELL_SIZE), r: Math.floor((worldZ - o.z) / LAYOUT_CELL_SIZE) };
  }

  _placeAtEntrance() {
    const grid = this._grid();
    let target = null;
    for (let r = 0; r < grid.length && !target; r++) {
      for (let c = 0; c < grid[0].length && !target; c++) {
        if (grid[r][c] === 'entrance') target = { r, c };
      }
    }
    if (!target) target = { r: Math.floor(grid.length / 2), c: Math.floor(grid[0].length / 2) };
    const o = this._origin();
    this.pos.set(
      o.x + (target.c + 0.5) * LAYOUT_CELL_SIZE,
      o.y + PLAYER_HEIGHT,
      o.z + (target.r + 0.5) * LAYOUT_CELL_SIZE,
    );
    this.yaw = 0;
    this.pitch = 0;
  }

  _tryLevelTransition(dir) {
    const { r, c } = this._worldToLocalCell(this.pos.x, this.pos.z);
    const cellId = this._grid()[r]?.[c];
    const isCirculation = cellId === 'stairs' || cellId === 'escalator' || cellId === 'elevator';
    if (!isCirculation) return;
    const nextIndex = this.levelIndex + dir;
    if (nextIndex < 0 || nextIndex >= this.design.levels.length) return;
    this.levelIndex = nextIndex;
    this._rebuild();
    const o = this._origin();
    this.pos.set(o.x + (c + 0.5) * LAYOUT_CELL_SIZE, o.y + PLAYER_HEIGHT, o.z + (r + 0.5) * LAYOUT_CELL_SIZE);
  }

  // ---------------- mesh ----------------

  _rebuild() {
    if (this.group) { this.scene.scene.remove(this.group); this._disposeGroup(this.group); }
    if (this.crowd) { this.crowd.dispose(this.scene.scene); this.crowd = null; }

    const grid = this._grid();
    const rows = grid.length, cols = grid[0].length;
    const o = this._origin();

    const group = buildStationInteriorGroup(this.design, this.levelIndex);
    this.scene.scene.add(group);
    this.group = group;

    const stats = computeStationStats(this.design);
    const agentCount = Math.max(5, Math.min(80, Math.round(stats.capacity / 50)));
    this.crowd = new StationCrowdPreview({ scene: this.scene.scene, origin: o, rows, cols, grid, agentCount });
  }

  // ---------------- movement ----------------

  _collideAndMove(dx, dz) {
    const r0 = PLAYER_RADIUS;
    const tryAxis = (nx, nz) => {
      const corners = [[nx - r0, nz - r0], [nx + r0, nz - r0], [nx - r0, nz + r0], [nx + r0, nz + r0]];
      return corners.every(([wx, wz]) => {
        const { r, c } = this._worldToLocalCell(wx, wz);
        return this._cellWalkable(r, c);
      });
    };
    if (tryAxis(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
    if (tryAxis(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
  }

  update(dt) {
    if (!this.active) return;

    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.sin(this.yaw + Math.PI / 2), 0, Math.cos(this.yaw + Math.PI / 2));
    let mx = 0, mz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) { mx += forward.x; mz += forward.z; }
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) { mx -= forward.x; mz -= forward.z; }
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) { mx -= right.x; mz -= right.z; }
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) { mx += right.x; mz += right.z; }
    const len = Math.hypot(mx, mz);
    if (len > 0.0001) {
      const step = (MOVE_SPEED * dt) / len;
      this._collideAndMove(mx * step, mz * step);
    }

    const cam = this.scene.camera;
    cam.position.copy(this.pos);
    const lookDir = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    cam.lookAt(this.pos.clone().add(lookDir));

    if (this.crowd) this.crowd.update(dt);
  }
}
