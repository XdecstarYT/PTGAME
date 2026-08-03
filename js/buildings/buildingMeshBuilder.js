import * as THREE from 'three';
import { BUILD_CELL_SIZE, LEVEL_HEIGHT_M, wallMaterial, roofMaterial, VOXEL_SIZE, voxelMaterialDef } from './buildingDefs.js';

function cellCenterLocal(cols, rows, c, r) {
  return {
    x: (c - cols / 2 + 0.5) * BUILD_CELL_SIZE,
    z: (r - rows / 2 + 0.5) * BUILD_CELL_SIZE,
  };
}

// World-space position of a structure grid's (0,0) cell's near/top-left
// corner - the counterpart cellCenterLocal() offsets from. Shared by the
// freeform click-placement engine (buildingEditorUI.js) to convert a
// raycast hit point back into a {r,c} cell via worldPointToGridCell().
export function structureGridOrigin(design) {
  return { x: -design.cols / 2 * BUILD_CELL_SIZE, z: -design.rows / 2 * BUILD_CELL_SIZE };
}

// A thin, mostly-transparent pick plane spanning one floor's whole
// footprint, tagged so the freeform placement engine can raycast against it
// to resolve clicks on still-empty cells (there's no real mesh there to
// click on otherwise). Rendered with a faint tint so the currently-active
// build floor also reads as a clear visual affordance.
export function buildFloorPickPlane(design, levelIndex) {
  const w = design.cols * BUILD_CELL_SIZE, d = design.rows * BUILD_CELL_SIZE;
  const geo = new THREE.PlaneGeometry(w, d);
  const mat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });
  const plane = new THREE.Mesh(geo, mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = levelIndex * LEVEL_HEIGHT_M + 0.02;
  plane.userData = { isBuildPlane: true, levelIndex };
  return plane;
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
    const garageMat = cachedMat('garage', () => new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.5, metalness: 0.15 }));
    const railMat = cachedMat('rail', () => new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.5, metalness: 0.4 }));
    const chimneyMat = cachedMat('chimney', () => new THREE.MeshStandardMaterial({ color: 0x6a4a3a, roughness: 0.85, metalness: 0.05 }));
    const skylightMat = cachedMat('skylight', () => new THREE.MeshStandardMaterial({ color: 0x9fd6e8, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.1 }));
    const roofDef = roofMaterial(design.roofMaterialId);
    const roofMat = cachedMat(`roof_${roofDef.id}`, () => new THREE.MeshStandardMaterial({
      color: roofDef.color, roughness: roofDef.roughness, metalness: roofDef.metalness,
    }));

    for (let r = 0; r < design.rows; r++) {
      for (let c = 0; c < design.cols; c++) {
        const id = level.grid[r][c];
        if (id === 'empty') continue;
        const { x, z } = cellCenterLocal(design.cols, design.rows, c, r);
        // Tagged onto every mesh built for this cell (a cell can produce more
        // than one, e.g. a window's frame+pane) so the freeform placement
        // engine can resolve a raycast hit straight back to {levelIndex,r,c}
        // without any coordinate math, the same way voxels already do via
        // userData.voxelKey.
        const cellTag = { isStructureCell: true, levelIndex: li, row: r, col: c };
        const tag = (mesh) => { mesh.userData = cellTag; return mesh; };

        if (id === 'wall' || id === 'pillar') {
          const size = id === 'pillar' ? cellSize * 0.4 : cellSize;
          const box = tag(new THREE.Mesh(new THREE.BoxGeometry(size, LEVEL_HEIGHT_M, size), mat));
          box.position.set(x, baseY + LEVEL_HEIGHT_M / 2, z);
          box.castShadow = true; box.receiveShadow = true;
          group.add(box);
        } else if (id === 'window') {
          const frame = tag(new THREE.Mesh(new THREE.BoxGeometry(cellSize, LEVEL_HEIGHT_M, cellSize * 0.92), mat));
          frame.position.set(x, baseY + LEVEL_HEIGHT_M / 2, z);
          frame.castShadow = true; frame.receiveShadow = true;
          group.add(frame);
          const pane = tag(new THREE.Mesh(new THREE.BoxGeometry(cellSize * 0.8, LEVEL_HEIGHT_M * 0.6, 0.06), glassMat));
          pane.position.set(x, baseY + LEVEL_HEIGHT_M * 0.55, z);
          pane.receiveShadow = true;
          group.add(pane);
        } else if (id === 'door') {
          const frame = tag(new THREE.Mesh(new THREE.BoxGeometry(cellSize, LEVEL_HEIGHT_M, cellSize * 0.92), mat));
          frame.position.set(x, baseY + LEVEL_HEIGHT_M / 2, z);
          frame.castShadow = true; frame.receiveShadow = true;
          group.add(frame);
          const door = tag(new THREE.Mesh(new THREE.BoxGeometry(cellSize * 0.55, LEVEL_HEIGHT_M * 0.75, 0.08), doorMat));
          door.position.set(x, baseY + LEVEL_HEIGHT_M * 0.375, z);
          door.receiveShadow = true;
          group.add(door);
        } else if (id === 'garage_door') {
          const frame = tag(new THREE.Mesh(new THREE.BoxGeometry(cellSize, LEVEL_HEIGHT_M, cellSize * 0.92), mat));
          frame.position.set(x, baseY + LEVEL_HEIGHT_M / 2, z);
          frame.castShadow = true; frame.receiveShadow = true;
          group.add(frame);
          const panel = tag(new THREE.Mesh(new THREE.BoxGeometry(cellSize * 0.9, LEVEL_HEIGHT_M * 0.62, 0.08), garageMat));
          panel.position.set(x, baseY + LEVEL_HEIGHT_M * 0.34, z);
          panel.receiveShadow = true;
          group.add(panel);
        } else if (id === 'arch') {
          // An open archway - a lintel + two side posts, deliberately leaving
          // the middle empty (unlike every other structure piece) so it
          // reads as a walk-through opening rather than a solid wall.
          const leftPost = tag(new THREE.Mesh(new THREE.BoxGeometry(cellSize * 0.2, LEVEL_HEIGHT_M, cellSize * 0.92), mat));
          leftPost.position.set(x - cellSize * 0.4, baseY + LEVEL_HEIGHT_M / 2, z);
          leftPost.castShadow = true; leftPost.receiveShadow = true;
          group.add(leftPost);
          const rightPost = tag(new THREE.Mesh(new THREE.BoxGeometry(cellSize * 0.2, LEVEL_HEIGHT_M, cellSize * 0.92), mat));
          rightPost.position.set(x + cellSize * 0.4, baseY + LEVEL_HEIGHT_M / 2, z);
          rightPost.castShadow = true; rightPost.receiveShadow = true;
          group.add(rightPost);
          const lintel = tag(new THREE.Mesh(new THREE.BoxGeometry(cellSize, LEVEL_HEIGHT_M * 0.22, cellSize * 0.92), mat));
          lintel.position.set(x, baseY + LEVEL_HEIGHT_M * 0.89, z);
          lintel.castShadow = true; lintel.receiveShadow = true;
          group.add(lintel);
        } else if (id === 'floor') {
          const slab = tag(new THREE.Mesh(new THREE.BoxGeometry(cellSize, 0.2, cellSize), mat));
          slab.position.set(x, baseY + 0.1, z);
          slab.receiveShadow = true;
          group.add(slab);
        } else if (id === 'balcony') {
          const slab = tag(new THREE.Mesh(new THREE.BoxGeometry(cellSize, 0.2, cellSize), mat));
          slab.position.set(x, baseY + 0.1, z);
          slab.receiveShadow = true;
          group.add(slab);
          const railHeight = 0.9, railThickness = 0.06;
          const railSpecs = [
            [cellSize, railHeight, railThickness, 0, -cellSize / 2 + railThickness / 2],
            [cellSize, railHeight, railThickness, 0, cellSize / 2 - railThickness / 2],
            [railThickness, railHeight, cellSize, -cellSize / 2 + railThickness / 2, 0],
            [railThickness, railHeight, cellSize, cellSize / 2 - railThickness / 2, 0],
          ];
          for (const [rw, rh, rd, dx, dz] of railSpecs) {
            const rail = tag(new THREE.Mesh(new THREE.BoxGeometry(rw, rh, rd), railMat));
            rail.position.set(x + dx, baseY + 0.2 + rh / 2, z + dz);
            group.add(rail);
          }
        } else if (id === 'roof_flat') {
          const slab = tag(new THREE.Mesh(new THREE.BoxGeometry(cellSize, 0.25, cellSize), roofMat));
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
          const slope = tag(new THREE.Mesh(geo, roofMat));
          slope.position.set(x, baseY, z - cellSize / 2);
          slope.castShadow = true; slope.receiveShadow = true;
          group.add(slope);
        } else if (id === 'chimney') {
          const cap = tag(new THREE.Mesh(new THREE.BoxGeometry(cellSize * 0.25, 0.25, cellSize * 0.25), roofMat));
          cap.position.set(x, baseY + 0.25 + 0.6, z);
          cap.castShadow = true;
          group.add(cap);
          const stack = tag(new THREE.Mesh(new THREE.BoxGeometry(cellSize * 0.35, 1.2, cellSize * 0.35), chimneyMat));
          stack.position.set(x, baseY + 0.6, z);
          stack.castShadow = true; stack.receiveShadow = true;
          group.add(stack);
        } else if (id === 'skylight') {
          const frame = tag(new THREE.Mesh(new THREE.BoxGeometry(cellSize, 0.3, cellSize), roofMat));
          frame.position.set(x, baseY + 0.15, z);
          frame.castShadow = true; frame.receiveShadow = true;
          group.add(frame);
          const pane = tag(new THREE.Mesh(new THREE.BoxGeometry(cellSize * 0.8, 0.08, cellSize * 0.8), skylightMat));
          pane.position.set(x, baseY + 0.34, z);
          group.add(pane);
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
        emissive: def.emissive ?? 0x000000, emissiveIntensity: def.emissiveIntensity ?? 1,
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
