import * as THREE from 'three';
import { LAYOUT_CELL_SIZE } from './stationDefs.js';

const CLOTHING_COLORS = [0xd9784f, 0x4f7fd9, 0x5fae6f, 0xc9a63d, 0x9d6fae, 0xd9528f];
const SKIN_COLORS = [0xe0b088, 0xc68a5f, 0x8d5a3c, 0xf0c9a0];

// Ported from the standalone station-builder tool's crowdPreview.js -
// placeholder passenger agents populated into walk mode so the player can
// see how crowded/legible a level actually feels at ground level - simple
// idle-wander body+head figures, not a real pedestrian simulation.
export class StationCrowdPreview {
  constructor({ scene, origin, rows, cols, grid, agentCount }) {
    this.agents = [];
    const spawnCells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] === 'platform' || grid[r][c] === 'waiting_area') spawnCells.push([r, c]);
      }
    }
    if (!spawnCells.length) return;

    for (let i = 0; i < agentCount; i++) {
      const [r, c] = spawnCells[Math.floor(Math.random() * spawnCells.length)];
      const baseX = origin.x + (c + 0.5) * LAYOUT_CELL_SIZE;
      const baseZ = origin.z + (r + 0.5) * LAYOUT_CELL_SIZE;

      const clothing = CLOTHING_COLORS[i % CLOTHING_COLORS.length];
      const skin = SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)];

      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.2, 0.75, 4, 8),
        new THREE.MeshStandardMaterial({ color: clothing }),
      );
      body.position.y = 0.2 + 0.375;
      body.castShadow = true;
      group.add(body);

      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 10, 8),
        new THREE.MeshStandardMaterial({ color: skin }),
      );
      head.position.y = 0.2 + 0.75 + 0.14;
      head.castShadow = true;
      group.add(head);

      group.position.set(baseX, origin.y, baseZ);
      scene.add(group);

      this.agents.push({
        mesh: group, baseX, baseZ,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.5,
        radius: 0.3 + Math.random() * 0.5,
      });
    }
  }

  update(dt) {
    const t = performance.now() / 1000;
    for (const a of this.agents) {
      const angle = t * a.speed + a.phase;
      a.mesh.position.x = a.baseX + Math.cos(angle) * a.radius;
      a.mesh.position.z = a.baseZ + Math.sin(angle) * a.radius;
      a.mesh.rotation.y = -angle;
    }
  }

  dispose(scene) {
    for (const a of this.agents) scene.remove(a.mesh);
    this.agents = [];
  }
}
