import * as THREE from 'three';
import { LAYOUT_CELL_SIZE, CELL_SIZE, interiorObject } from './config.js';
import { CrowdPreview } from './crowdPreview.js';
import { computeStats } from './statEngine.js';

const LEVEL_HEIGHT_M = 4; // vertical gap between stacked levels in the walkable view
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.35;
const MOVE_SPEED = 3.2; // m/s
const WALL_HEIGHT = 3;
const OBSTACLE_HEIGHT = 1.1;

// First-person walkable inspection mode for a single selected station.
// Builds a simple extruded-from-the-grid 3D representation of whichever
// level is active, with basic grid-based collision against non-walkable
// interior objects and the footprint's outer walls. Stairs/escalators/
// elevators are level-transition triggers rather than simulated physically
// - stepping onto one and pressing E/Q teleports the player to the same
// grid cell one level up/down. Levels are stacked purely for visual
// separation in this standalone tool; it isn't a claim about which levels
// are physically above or below street level.
export class WalkController {
  constructor({ sceneManager, onExit }) {
    this.sceneManager = sceneManager;
    this.onExit = onExit || (() => {});
    this.active = false;
    this.station = null;
    this.levelIndex = 0;
    this.group = null;
    this.crowd = null;

    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.keys = new Set();
    this._onCirculationCell = null;

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

    const canvas = this.sceneManager.canvas;
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

  enter(station, levelIndex = 0) {
    this.station = station;
    this.levelIndex = Math.min(levelIndex, station.levels.length - 1);
    this.active = true;
    this._rebuild();
    this._placeAtEntrance();
    this.sceneManager.controls.enabled = false;
  }

  exit() {
    this.active = false;
    const station = this.station;
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.group) { this.sceneManager.scene.remove(this.group); this.group = null; }
    if (this.crowd) { this.crowd.dispose(this.sceneManager.scene); this.crowd = null; }
    this.sceneManager.controls.enabled = true;
    this.onExit(station);
  }

  get originWorld() {
    return {
      x: this.station.x * CELL_SIZE,
      z: this.station.z * CELL_SIZE,
      y: this.levelIndex * LEVEL_HEIGHT_M,
    };
  }

  _grid() { return this.station.levels[this.levelIndex].grid; }

  _cellWalkable(r, c) {
    const grid = this._grid();
    if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length) return false;
    const obj = interiorObject(grid[r][c]);
    return !obj || obj.walkable !== false;
  }

  _worldToLocalCell(worldX, worldZ) {
    const o = this.originWorld;
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
    const o = this.originWorld;
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
    if (nextIndex < 0 || nextIndex >= this.station.levels.length) return;
    this.levelIndex = nextIndex;
    this._rebuild();
    const o = this.originWorld;
    this.pos.set(o.x + (c + 0.5) * LAYOUT_CELL_SIZE, o.y + PLAYER_HEIGHT, o.z + (r + 0.5) * LAYOUT_CELL_SIZE);
  }

  _rebuild() {
    if (this.group) this.sceneManager.scene.remove(this.group);
    if (this.crowd) this.crowd.dispose(this.sceneManager.scene);

    const group = new THREE.Group();
    const grid = this._grid();
    const rows = grid.length, cols = grid[0].length;
    const o = this.originWorld;
    const w = cols * LAYOUT_CELL_SIZE, d = rows * LAYOUT_CELL_SIZE;

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: 0xcfd3da, roughness: 0.95 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(o.x + w / 2, o.y, o.z + d / 2);
    floor.receiveShadow = true;
    group.add(floor);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = grid[r][c];
        if (id === 'empty') continue;
        const obj = interiorObject(id);
        const cx = o.x + (c + 0.5) * LAYOUT_CELL_SIZE;
        const cz = o.z + (r + 0.5) * LAYOUT_CELL_SIZE;

        if (obj.walkable && obj.category !== 'circulation') {
          const decal = new THREE.Mesh(
            new THREE.PlaneGeometry(LAYOUT_CELL_SIZE * 0.94, LAYOUT_CELL_SIZE * 0.94),
            new THREE.MeshStandardMaterial({ color: obj.color }),
          );
          decal.rotation.x = -Math.PI / 2;
          decal.position.set(cx, o.y + 0.02, cz);
          group.add(decal);
        } else if (obj.category === 'circulation') {
          const marker = new THREE.Mesh(
            new THREE.CylinderGeometry(0.28, 0.28, 2.4, 10),
            new THREE.MeshStandardMaterial({ color: obj.color, emissive: obj.color, emissiveIntensity: 0.25 }),
          );
          marker.position.set(cx, o.y + 1.2, cz);
          group.add(marker);
          const decal = new THREE.Mesh(
            new THREE.PlaneGeometry(LAYOUT_CELL_SIZE * 0.94, LAYOUT_CELL_SIZE * 0.94),
            new THREE.MeshStandardMaterial({ color: obj.color }),
          );
          decal.rotation.x = -Math.PI / 2;
          decal.position.set(cx, o.y + 0.02, cz);
          group.add(decal);
        } else {
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(LAYOUT_CELL_SIZE * 0.85, OBSTACLE_HEIGHT, LAYOUT_CELL_SIZE * 0.85),
            new THREE.MeshStandardMaterial({ color: obj.color }),
          );
          box.position.set(cx, o.y + OBSTACLE_HEIGHT / 2, cz);
          box.castShadow = true;
          group.add(box);
        }
      }
    }

    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8 });
    const wallThickness = 0.2;
    const northWall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, wallThickness), wallMat);
    northWall.position.set(o.x + w / 2, o.y + WALL_HEIGHT / 2, o.z);
    const southWall = northWall.clone();
    southWall.position.z = o.z + d;
    const westWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, WALL_HEIGHT, d), wallMat);
    westWall.position.set(o.x, o.y + WALL_HEIGHT / 2, o.z + d / 2);
    const eastWall = westWall.clone();
    eastWall.position.x = o.x + w;
    group.add(northWall, southWall, westWall, eastWall);

    this.sceneManager.scene.add(group);
    this.group = group;

    const stats = computeStats(this.station);
    const agentCount = Math.max(5, Math.min(80, Math.round(stats.capacity / 50)));
    this.crowd = new CrowdPreview({ scene: this.sceneManager.scene, origin: o, rows, cols, grid, agentCount });
  }

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

    const cam = this.sceneManager.camera;
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
