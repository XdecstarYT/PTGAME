import * as THREE from 'three';
import { BUILD_CELL_SIZE, LEVEL_HEIGHT_M, wallMaterial } from './buildingDefs.js';

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
