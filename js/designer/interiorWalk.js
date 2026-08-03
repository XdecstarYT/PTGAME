import * as THREE from 'three';
import { seatMaterialById } from './vehicleStyleDefs.js';

// First-person walkable inspection mode for the vehicle designer's own
// floor plan - the interior equivalent of the station builder's WalkController
// (station-builder/js/walkMode.js), same pointer-lock + WASD + grid-based
// AABB collision approach, adapted to a vehicle's (rows=width, cols=length)
// floor plan instead of a station's (rows, cols) layout grid. Stairs cells
// on a double-decker are level-transition triggers exactly like the station
// builder's stairs/escalator/elevator cells - stepping onto one and pressing
// E/Q teleports to the same grid cell on the other deck.
const PLAYER_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.28;
const MOVE_SPEED = 2.6; // m/s - a bit slower than the station builder's since the space is tighter
const CEILING_HEIGHT = 2.05; // interior headroom per deck
const DECK_GAP = 0.35; // structural gap between the lower ceiling and upper floor

const NON_WALKABLE = new Set(['seat', 'luggage']);

export class InteriorWalkController {
  constructor({ scene, onExit }) {
    this.scene = scene; // a DesignerScene instance - shares its camera/renderer/controls
    this.onExit = onExit || (() => {});
    this.active = false;
    this.model = null;
    this.chassis = null;
    this.deck = 0;
    this.group = null;

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
      if (e.code === 'KeyE') this._tryDeckTransition(1);
      if (e.code === 'KeyQ') this._tryDeckTransition(-1);
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

  enter(model, chassis) {
    this.model = model;
    this.chassis = chassis;
    this.deck = 0;
    this.active = true;
    this._rebuild();
    this._placeAtEntrance();
    this.scene.controls.enabled = false;
  }

  exit() {
    this.active = false;
    if (document.pointerLockElement) document.exitPointerLock();
    if (this.group) { this.scene.scene.remove(this.group); this._disposeGroup(this.group); this.group = null; }
    this.scene.controls.enabled = true;
    this.onExit();
  }

  _disposeGroup(group) {
    group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }

  // ---------------- grid <-> world ----------------

  _floorPlan() { return this.deck === 1 ? this.model.upperFloorPlan : this.model.floorPlan; }
  _floorY() { return 0.5 + this.deck * (CEILING_HEIGHT + DECK_GAP); }
  _cellSize() { return { w: this.chassis.lengthUnits / this.chassis.gridCols, d: (2.2 + this.chassis.gridRows * 0.5) / this.chassis.gridRows }; }

  // column -> local X (length), row -> local Z (width) - matches the same
  // mapping vehicleMeshBuilder.js's door-position math uses, so a stairs
  // cell painted under a real doorway lines up with what you'd expect.
  _cellToWorld(r, c) {
    const { w, d } = this._cellSize();
    const carLen = this.chassis.lengthUnits;
    const carWidth = 2.2 + this.chassis.gridRows * 0.5;
    return { x: -carLen / 2 + (c + 0.5) * w, z: -carWidth / 2 + (r + 0.5) * d };
  }

  _worldToCell(x, z) {
    const { w, d } = this._cellSize();
    const carLen = this.chassis.lengthUnits;
    const carWidth = 2.2 + this.chassis.gridRows * 0.5;
    return { c: Math.floor((x + carLen / 2) / w), r: Math.floor((z + carWidth / 2) / d) };
  }

  _cellWalkable(r, c) {
    const plan = this._floorPlan();
    if (!plan || r < 0 || c < 0 || r >= plan.length || c >= plan[0].length) return false;
    return !NON_WALKABLE.has(plan[r][c]);
  }

  _placeAtEntrance() {
    const plan = this._floorPlan();
    const rows = plan.length, cols = plan[0].length;
    let target = null;
    for (let r = 0; r < rows && !target; r++) {
      for (let c = 0; c < cols && !target; c++) {
        if (plan[r][c] === 'aisle') target = { r, c };
      }
    }
    if (!target) target = { r: Math.floor(rows / 2), c: Math.floor(cols / 2) };
    const w = this._cellToWorld(target.r, target.c);
    const y = this._floorY();
    this.pos.set(w.x, y + PLAYER_HEIGHT, w.z);
    this.yaw = 0;
    this.pitch = 0;
  }

  _tryDeckTransition(dir) {
    if (this.model.deckCount !== 2 || !this.model.upperFloorPlan) return;
    const { r, c } = this._worldToCell(this.pos.x, this.pos.z);
    if (this._floorPlan()[r]?.[c] !== 'stairs') return;
    const nextDeck = this.deck + dir;
    if (nextDeck < 0 || nextDeck > 1) return;
    this.deck = nextDeck;
    this._rebuild();
    const w = this._cellToWorld(r, c);
    this.pos.set(w.x, this._floorY() + PLAYER_HEIGHT, w.z);
  }

  // ---------------- mesh ----------------

  _rebuild() {
    if (this.group) { this.scene.scene.remove(this.group); this._disposeGroup(this.group); }
    const group = new THREE.Group();
    const plan = this._floorPlan();
    const rows = plan.length, cols = plan[0].length;
    const { w: cellW, d: cellD } = this._cellSize();
    const carLen = this.chassis.lengthUnits;
    const carWidth = 2.2 + this.chassis.gridRows * 0.5;
    const y = this._floorY();

    const cellColor = {
      seat: 0x4ea8de, standing: 0x90be6d, wheelchair: 0xf9844a,
      aisle: 0x33363f, luggage: 0xb08968, stairs: 0xc9a63d,
    };

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(carLen, carWidth),
      new THREE.MeshStandardMaterial({ color: 0xd9dbe2, roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, y, 0);
    floor.receiveShadow = true;
    group.add(floor);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(carLen, carWidth),
      new THREE.MeshStandardMaterial({ color: 0xf2f0eb, roughness: 0.95, side: THREE.DoubleSide }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, y + CEILING_HEIGHT, 0);
    group.add(ceiling);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = plan[r][c];
        const { x, z } = this._cellToWorld(r, c);
        const decal = new THREE.Mesh(
          new THREE.PlaneGeometry(cellW * 0.96, cellD * 0.96),
          new THREE.MeshStandardMaterial({ color: cellColor[id] ?? 0x555555 }),
        );
        decal.rotation.x = -Math.PI / 2;
        decal.position.set(x, y + 0.01, z);
        group.add(decal);

        if (id === 'seat') {
          // Reflects the Interior tab's seat material/color choice
          // (model.interiorStyle) - roughness varies by material (fabric vs
          // leather etc, see vehicleStyleDefs.js), defaulting to the same
          // values this always rendered with for designs saved before that
          // field existed.
          const style = this.model.interiorStyle || {};
          const seatMat = seatMaterialById(style.seatMaterial);
          const seat = new THREE.Mesh(
            new THREE.BoxGeometry(cellW * 0.8, 0.45, cellD * 0.8),
            new THREE.MeshStandardMaterial({
              color: style.seatColor ?? 0x2f6690, roughness: seatMat.roughness, metalness: seatMat.metalness,
            }),
          );
          seat.position.set(x, y + 0.225, z);
          seat.castShadow = true;
          group.add(seat);
        } else if (id === 'luggage') {
          const rack = new THREE.Mesh(
            new THREE.BoxGeometry(cellW * 0.85, 0.55, cellD * 0.85),
            new THREE.MeshStandardMaterial({ color: 0x6b5136, roughness: 0.75 }),
          );
          rack.position.set(x, y + 0.275, z);
          rack.castShadow = true;
          group.add(rack);
        } else if (id === 'standing') {
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, CEILING_HEIGHT * 0.9, 8),
            new THREE.MeshStandardMaterial({ color: 0xb9bcc2, metalness: 0.6, roughness: 0.3 }),
          );
          pole.position.set(x, y + CEILING_HEIGHT * 0.45, z);
          group.add(pole);
        } else if (id === 'stairs') {
          const step = new THREE.Mesh(
            new THREE.BoxGeometry(cellW * 0.9, 0.15, cellD * 0.9),
            new THREE.MeshStandardMaterial({ color: 0x8a7a3d, roughness: 0.6 }),
          );
          step.position.set(x, y + 0.075, z);
          group.add(step);
        }
      }
    }

    // Side walls (where doors are) built per-column so door zones leave a
    // gap - only the lower deck has real doors, matching the exterior mesh.
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8 });
    const wallH = CEILING_HEIGHT, wallT = 0.06;
    for (let c = 0; c < cols; c++) {
      const isDoor = this.deck === 0 && (this.chassis.doorZones || []).includes(c);
      if (isDoor) continue;
      const { x } = this._cellToWorld(0, c);
      for (const side of [1, -1]) {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(cellW * 1.02, wallH, wallT), wallMat);
        seg.position.set(x, y + wallH / 2, side * carWidth / 2);
        group.add(seg);
      }
    }
    // Front/back end walls - no doors modeled here, just a flat panel.
    const endWallMat = new THREE.MeshStandardMaterial({ color: 0xdedede });
    for (const ex of [-carLen / 2, carLen / 2]) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, carWidth), endWallMat);
      seg.position.set(ex, y + wallH / 2, 0);
      group.add(seg);
    }

    this.scene.scene.add(group);
    this.group = group;
  }

  // ---------------- movement ----------------

  _collideAndMove(dx, dz) {
    const r0 = PLAYER_RADIUS;
    const tryAxis = (nx, nz) => {
      const corners = [[nx - r0, nz - r0], [nx + r0, nz - r0], [nx - r0, nz + r0], [nx + r0, nz + r0]];
      return corners.every(([wx, wz]) => {
        const { r, c } = this._worldToCell(wx, wz);
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
  }
}
