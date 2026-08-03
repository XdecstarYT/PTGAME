import * as THREE from 'three';
import { LAYOUT_CELL_SIZE, stationInteriorObject, stationArchitectureStyle } from './stationDefs.js';
import { buildStationFurnitureMesh, buildPlatformEdgeStrip } from './stationFurniture.js';
import { StationCrowdPreview } from './stationCrowdPreview.js';
import { buildCanopyGeometry, buildRibGeometry, skyMuralTexture } from './stationMeshBuilder.js';
import { computeStationStats } from './stationStatEngine.js';

const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.35;
const MOVE_SPEED = 3.2; // m/s
const WALL_HEIGHT = 3;

function adPosterTexture(title, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 192; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.fillStyle = color;
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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

  _origin() {
    const grid = this._grid();
    const cols = grid[0].length, rows = grid.length;
    return { x: -cols * LAYOUT_CELL_SIZE / 2, y: 0, z: -rows * LAYOUT_CELL_SIZE / 2 };
  }

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

    const group = new THREE.Group();
    const grid = this._grid();
    const rows = grid.length, cols = grid[0].length;
    const o = this._origin();
    const w = cols * LAYOUT_CELL_SIZE, d = rows * LAYOUT_CELL_SIZE;
    const style = stationArchitectureStyle(this.design.architectureStyleId);
    const isFuturistic = style.id === 'futuristic';

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: isFuturistic ? 0xe8ece6 : 0xcfd3da, roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(o.x + w / 2, o.y, o.z + d / 2);
    floor.receiveShadow = true;
    group.add(floor);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = grid[r][c];
        if (id === 'empty') continue;
        const obj = stationInteriorObject(id);
        const cx = o.x + (c + 0.5) * LAYOUT_CELL_SIZE;
        const cz = o.z + (r + 0.5) * LAYOUT_CELL_SIZE;

        const furniture = buildStationFurnitureMesh(id, obj.color);
        if (furniture) {
          furniture.position.set(cx, o.y, cz);
          group.add(furniture);
          if (obj.category === 'circulation') {
            const decal = new THREE.Mesh(
              new THREE.PlaneGeometry(LAYOUT_CELL_SIZE * 0.94, LAYOUT_CELL_SIZE * 0.94),
              new THREE.MeshStandardMaterial({ color: obj.color }),
            );
            decal.rotation.x = -Math.PI / 2;
            decal.position.set(cx, o.y + 0.02, cz);
            group.add(decal);
          }
        } else {
          const decal = new THREE.Mesh(
            new THREE.PlaneGeometry(LAYOUT_CELL_SIZE * 0.94, LAYOUT_CELL_SIZE * 0.94),
            new THREE.MeshStandardMaterial({ color: obj.color }),
          );
          decal.rotation.x = -Math.PI / 2;
          decal.position.set(cx, o.y + 0.02, cz);
          group.add(decal);
        }

        // Platform cells get a yellow/black hazard strip along whichever
        // edges face something other than more platform/waiting-area -
        // i.e. the edge(s) that would face a track.
        if (id === 'platform') {
          const neighbors = [
            ['north', r - 1, c], ['south', r + 1, c], ['west', r, c - 1], ['east', r, c + 1],
          ];
          for (const [side, nr, nc] of neighbors) {
            const outOfBounds = nr < 0 || nc < 0 || nr >= rows || nc >= cols;
            const neighborId = outOfBounds ? null : grid[nr][nc];
            const facesTrack = outOfBounds || (neighborId !== 'platform' && neighborId !== 'waiting_area');
            if (!facesTrack) continue;
            const strip = buildPlatformEdgeStrip(side);
            strip.position.x += cx;
            strip.position.z += cz;
            group.add(strip);
          }
        }
      }
    }

    const wallMat = new THREE.MeshStandardMaterial({
      color: isFuturistic ? style.wall : 0xe8e8e8,
      transparent: isFuturistic, opacity: isFuturistic ? 0.35 : 1,
      roughness: isFuturistic ? 0.15 : 0.85,
    });
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

    if (isFuturistic) {
      const canopyGeo = buildCanopyGeometry(w, d, 28);
      const canopyMat = new THREE.MeshStandardMaterial({
        color: style.roof, map: skyMuralTexture(), emissive: 0xffffff, emissiveMap: skyMuralTexture(),
        emissiveIntensity: 0.5, transparent: true, opacity: 0.5, side: THREE.DoubleSide, roughness: 0.1,
      });
      const canopy = new THREE.Mesh(canopyGeo, canopyMat);
      // buildCanopyGeometry already runs its length along local X and its
      // arc across local Z, matching this room's (w=cols=X, d=rows=Z)
      // convention directly - no extra rotation needed here.
      canopy.position.set(o.x + w / 2, o.y + WALL_HEIGHT, o.z + d / 2);
      group.add(canopy);

      const ribMat = new THREE.MeshStandardMaterial({ color: style.accent, emissive: style.accent, emissiveIntensity: 0.4, roughness: 0.4 });
      const ribCount = Math.max(3, Math.round(w / 4));
      for (let i = 0; i < ribCount; i++) {
        const t = ribCount === 1 ? 0.5 : i / (ribCount - 1);
        // buildRibGeometry already arcs across Z (spanZ) - spacing copies
        // along X gives the same ribbed-vault look as the exterior shell.
        const ribGeo = buildRibGeometry(d, d * 0.02);
        const rib = new THREE.Mesh(ribGeo, ribMat);
        rib.position.set(o.x + t * w, o.y + WALL_HEIGHT, o.z + d / 2);
        rib.castShadow = true;
        group.add(rib);
      }

      // Ad posters along the north wall, evenly spaced.
      const posterTitles = ['IRIS', 'NOW\nBOARDING', 'CITY\nGUIDE'];
      const posterColors = ['#2f7a45', '#4aa3c7', '#c9a63d'];
      for (let i = 0; i < 3; i++) {
        const tex = adPosterTexture(posterTitles[i], posterColors[i]);
        const poster = new THREE.Mesh(
          new THREE.PlaneGeometry(1.1, 1.5),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }),
        );
        poster.position.set(o.x + w * ((i + 1) / 4), o.y + 1.6, o.z + 0.11);
        group.add(poster);
      }
    } else {
      const ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(w, d),
        new THREE.MeshStandardMaterial({ color: 0xf2f0eb, roughness: 0.95, side: THREE.DoubleSide }),
      );
      ceiling.rotation.x = Math.PI / 2;
      ceiling.position.set(o.x + w / 2, o.y + WALL_HEIGHT, o.z + d / 2);
      group.add(ceiling);
    }

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
