import * as THREE from 'three';
import { WORLD_CELLS, CELL_SIZE } from './config.js';

// A deliberately simple placeholder "map" to build stations onto: just
// enough terrain variety (roads, a waterfront, a rail corridor, subway
// tunnel portals) to give the access-rule checks in placement.js something
// real to validate against. Not meant to resemble the main game's
// procedural city - this tool is standalone until an integration pass.
export class World {
  constructor() {
    this.size = WORLD_CELLS;
    // cell(x,z) -> 'ground' | 'road' | 'water' | 'rail' | 'tunnel'
    this.grid = new Array(this.size * this.size).fill('ground');
    this._build();
  }

  idx(x, z) { return z * this.size + x; }
  inBounds(x, z) { return x >= 0 && z >= 0 && x < this.size && z < this.size; }
  cellAt(x, z) { return this.inBounds(x, z) ? this.grid[this.idx(x, z)] : null; }

  _build() {
    const n = this.size;
    // Waterfront: a river band along the west edge, with a gentle wobble.
    for (let z = 0; z < n; z++) {
      const wobble = Math.round(Math.sin(z * 0.12) * 2.5);
      const width = 9 + wobble;
      for (let x = 0; x < Math.max(3, width); x++) {
        if (this.inBounds(x, z)) this.grid[this.idx(x, z)] = 'water';
      }
    }
    // Road grid: streets every 10 cells in both directions.
    for (let x = 0; x < n; x++) {
      for (let z = 0; z < n; z++) {
        if (this.cellAt(x, z) === 'water') continue;
        if (x % 10 === 0 || z % 10 === 0) this.grid[this.idx(x, z)] = 'road';
      }
    }
    // Rail corridor: a dedicated double-track line, distinct from roads,
    // running east-west across the eastern two-thirds of the map.
    const railZ = 52;
    for (let x = 20; x < n; x++) {
      for (const dz of [0, 1]) {
        const z = railZ + dz;
        if (this.inBounds(x, z)) this.grid[this.idx(x, z)] = 'rail';
      }
    }
    // Subway tunnel portals: a handful of fixed access points scattered
    // around the map interior.
    this.tunnelPortals = [
      { x: 24, z: 20 }, { x: 60, z: 28 }, { x: 40, z: 70 }, { x: 78, z: 66 },
    ];
    for (const p of this.tunnelPortals) {
      if (this.inBounds(p.x, p.z)) this.grid[this.idx(p.x, p.z)] = 'tunnel';
    }
  }

  // Distance in cells from (x,z) to the nearest cell of the given type
  // within a bounded search radius (cheap enough for interactive use since
  // footprints are checked live under the mouse cursor).
  distanceToNearest(x, z, type, maxRadius) {
    if (this.cellAt(x, z) === type) return 0;
    for (let r = 1; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.cellAt(x + dx, z + dz) === type) return r;
        }
      }
    }
    return Infinity;
  }

  // Builds the placeholder terrain visuals: a base ground plane plus one
  // InstancedMesh per cell-type layer (road/water/rail) and small markers
  // for the tunnel portals. Returns a THREE.Group ready to add to the scene.
  buildMeshes() {
    const group = new THREE.Group();
    const worldSize = this.size * CELL_SIZE;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(worldSize, worldSize),
      new THREE.MeshStandardMaterial({ color: 0xc9d1a8, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(worldSize / 2, 0, worldSize / 2);
    ground.receiveShadow = true;
    group.add(ground);

    const layer = (type, color, y, roughness = 0.9) => {
      const cells = [];
      for (let x = 0; x < this.size; x++) {
        for (let z = 0; z < this.size; z++) {
          if (this.cellAt(x, z) === type) cells.push([x, z]);
        }
      }
      if (!cells.length) return;
      const geo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
      const mat = new THREE.MeshStandardMaterial({ color, roughness });
      const mesh = new THREE.InstancedMesh(geo, mat, cells.length);
      mesh.receiveShadow = true;
      const m = new THREE.Matrix4();
      const rot = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
      cells.forEach(([x, z], i) => {
        const px = x * CELL_SIZE + CELL_SIZE / 2;
        const pz = z * CELL_SIZE + CELL_SIZE / 2;
        m.copy(rot).setPosition(px, y, pz);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    };

    layer('road', 0x3a3d42, 0.02);
    layer('water', 0x3d6ea5, 0.015, 0.35);
    layer('rail', 0x8a7a63, 0.02);

    for (const p of this.tunnelPortals) {
      const px = p.x * CELL_SIZE + CELL_SIZE / 2;
      const pz = p.z * CELL_SIZE + CELL_SIZE / 2;
      const disc = new THREE.Mesh(
        new THREE.CylinderGeometry(CELL_SIZE * 1.4, CELL_SIZE * 1.4, 0.3, 20),
        new THREE.MeshStandardMaterial({ color: 0x232323 }),
      );
      disc.position.set(px, 0.15, pz);
      disc.castShadow = true;
      disc.receiveShadow = true;
      group.add(disc);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(CELL_SIZE * 1.1, 0.14, 10, 24),
        new THREE.MeshStandardMaterial({ color: 0xe0552b, emissive: 0x662200, emissiveIntensity: 0.6 }),
      );
      ring.position.set(px, 0.32, pz);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }

    return group;
  }
}
