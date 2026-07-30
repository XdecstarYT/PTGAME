import * as THREE from 'three';
import { BUILD_CELL_SIZE, LEVEL_HEIGHT_M, wallMaterial, VOXEL_SIZE, voxelMaterialDef } from './buildingDefs.js';

function cellCenterLocal(cols, rows, c, r) {
  return {
    x: (c - cols / 2 + 0.5) * BUILD_CELL_SIZE,
    z: (r - rows / 2 + 0.5) * BUILD_CELL_SIZE,
  };
}

// Builds the prefab "structure" shell for a building design: walls/windows/
// doors/pillars extruded per floor, floor slabs, and roof caps, all driven
// by the player's own per-cell paint choices - contrast with the station
// builder's architecture.js, which builds one of a handful of preset shells.
export function buildStructureMesh(design) {
  const group = new THREE.Group();
  const cellSize = BUILD_CELL_SIZE;
  const matCache = new Map();
  function cachedMat(key, factory) {
    if (!matCache.has(key)) matCache.set(key, factory());
    return matCache.get(key);
  }

  design.levels.forEach((level, li) => {
    const baseY = li * LEVEL_HEIGHT_M;
    const def = wallMaterial(level.wallMaterialId);
    const mat = cachedMat(level.wallMaterialId, () => new THREE.MeshStandardMaterial({
      color: def.color, roughness: def.roughness, metalness: def.metalness,
    }));
    const glassMat = cachedMat('glass', () => new THREE.MeshStandardMaterial({
      color: 0x9fd6e8, transparent: true, opacity: 0.5, roughness: 0.15, metalness: 0.2,
    }));
    const doorMat = cachedMat('door', () => new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.5 }));

    for (let r = 0; r < design.rows; r++) {
      for (let c = 0; c < design.cols; c++) {
        const id = level.grid[r][c];
        if (id === 'empty') continue;
        const { x, z } = cellCenterLocal(design.cols, design.rows, c, r);

        if (id === 'wall' || id === 'pillar') {
          const size = id === 'pillar' ? cellSize * 0.4 : cellSize;
          const box = new THREE.Mesh(new THREE.BoxGeometry(size, LEVEL_HEIGHT_M, size), mat);
          box.position.set(x, baseY + LEVEL_HEIGHT_M / 2, z);
          box.castShadow = true; box.receiveShadow = true;
          group.add(box);
        } else if (id === 'window') {
          const frame = new THREE.Mesh(new THREE.BoxGeometry(cellSize, LEVEL_HEIGHT_M, cellSize * 0.92), mat);
          frame.position.set(x, baseY + LEVEL_HEIGHT_M / 2, z);
          frame.castShadow = true;
          group.add(frame);
          const pane = new THREE.Mesh(new THREE.BoxGeometry(cellSize * 0.8, LEVEL_HEIGHT_M * 0.6, 0.06), glassMat);
          pane.position.set(x, baseY + LEVEL_HEIGHT_M * 0.55, z);
          group.add(pane);
        } else if (id === 'door') {
          const frame = new THREE.Mesh(new THREE.BoxGeometry(cellSize, LEVEL_HEIGHT_M, cellSize * 0.92), mat);
          frame.position.set(x, baseY + LEVEL_HEIGHT_M / 2, z);
          frame.castShadow = true;
          group.add(frame);
          const door = new THREE.Mesh(new THREE.BoxGeometry(cellSize * 0.55, LEVEL_HEIGHT_M * 0.75, 0.08), doorMat);
          door.position.set(x, baseY + LEVEL_HEIGHT_M * 0.375, z);
          group.add(door);
        } else if (id === 'floor') {
          const slab = new THREE.Mesh(new THREE.BoxGeometry(cellSize, 0.2, cellSize), mat);
          slab.position.set(x, baseY + 0.1, z);
          slab.receiveShadow = true;
          group.add(slab);
        } else if (id === 'roof_flat') {
          const slab = new THREE.Mesh(new THREE.BoxGeometry(cellSize, 0.25, cellSize), mat);
          slab.position.set(x, baseY + 0.125, z);
          slab.castShadow = true; slab.receiveShadow = true;
          group.add(slab);
        } else if (id === 'roof_slope') {
          const shape = new THREE.Shape();
          shape.moveTo(-cellSize / 2, 0);
          shape.lineTo(cellSize / 2, 0);
          shape.lineTo(0, cellSize * 0.6);
          shape.lineTo(-cellSize / 2, 0);
          const geo = new THREE.ExtrudeGeometry(shape, { depth: cellSize, bevelEnabled: false });
          geo.rotateX(-Math.PI / 2);
          geo.translate(0, 0, cellSize / 2);
          const slope = new THREE.Mesh(geo, mat);
          slope.position.set(x, baseY, z - cellSize / 2);
          slope.castShadow = true;
          group.add(slope);
        }
      }
    }
  });

  return group;
}

// ---------------- voxel decoration layer (Phase 2) ----------------

// Voxel (x,y,z) are integer counts of VOXEL_SIZE - x/z are centered on the
// building's local origin (same origin the structure grid uses), y=0 is the
// layer sitting on the ground. Kept as plain functions (not a class) so the
// same conversion is usable from both the mesh builder and the editor's
// raycast placement logic without importing THREE-specific state.
export function voxelWorldPosition(x, y, z) {
  return {
    x: x * VOXEL_SIZE,
    y: y * VOXEL_SIZE + VOXEL_SIZE / 2,
    z: z * VOXEL_SIZE,
  };
}

// Converts a world-space point into the voxel coordinate it falls inside -
// used both to find the clicked voxel (for removal) and, offset slightly
// along a face normal first, the empty voxel adjacent to it (for placement).
export function worldPointToVoxelCoord(point) {
  return {
    x: Math.round(point.x / VOXEL_SIZE),
    y: Math.floor(point.y / VOXEL_SIZE),
    z: Math.round(point.z / VOXEL_SIZE),
  };
}

// Builds one tagged (userData.isVoxel/voxelKey), individually-meshed box per
// voxel - simple and raycast-friendly. Building designs are small enough
// (tens to low hundreds of voxels) that this is plenty fast without the
// added complexity of InstancedMesh + manual instance-id bookkeeping;
// revisit only if real designs turn out to need thousands of blocks.
export function buildVoxelMesh(design) {
  const group = new THREE.Group();
  const matCache = new Map();
  for (const v of design.voxels || []) {
    if (!matCache.has(v.materialId)) {
      const def = voxelMaterialDef(v.materialId);
      matCache.set(v.materialId, new THREE.MeshStandardMaterial({
        color: def.color, roughness: def.roughness, metalness: def.metalness,
        transparent: !!def.transparent, opacity: def.opacity ?? 1,
      }));
    }
    const pos = voxelWorldPosition(v.x, v.y, v.z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(VOXEL_SIZE * 0.98, VOXEL_SIZE * 0.98, VOXEL_SIZE * 0.98), matCache.get(v.materialId));
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.isVoxel = true;
    mesh.userData.voxelKey = `${v.x},${v.y},${v.z}`;
    group.add(mesh);
  }
  return group;
}
