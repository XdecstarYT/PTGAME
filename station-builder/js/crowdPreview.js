import * as THREE from 'three';
import { LAYOUT_CELL_SIZE } from './config.js';

const AGENT_COLORS = [0xd9784f, 0x4f7fd9, 0x5fae6f, 0xc9a63d, 0x9d6fae, 0xd9528f];

// Placeholder passenger agents populated into walk mode so the player can
// see how crowded/legible a level actually feels at ground level - simple
// idle-wander capsules, not a real pedestrian simulation.
export class CrowdPreview {
  constructor({ scene, origin, rows, cols, grid, agentCount }) {
    this.agents = [];
    const spawnCells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] === 'platform' || grid[r][c] === 'waiting_area') spawnCells.push([r, c]);
      }
    }
    if (!spawnCells.length) {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (grid[r][c] !== 'empty' || true) spawnCells.push([r, c]);
    }
    if (!spawnCells.length) return;

    for (let i = 0; i < agentCount; i++) {
      const [r, c] = spawnCells[Math.floor(Math.random() * spawnCells.length)];
      const baseX = origin.x + (c + 0.5) * LAYOUT_CELL_SIZE;
      const baseZ = origin.z + (r + 0.5) * LAYOUT_CELL_SIZE;

      const color = AGENT_COLORS[i % AGENT_COLORS.length];
      const mesh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.22, 1.05, 4, 8),
        new THREE.MeshStandardMaterial({ color }),
      );
      mesh.position.set(baseX, origin.y + 0.22 + 0.525, baseZ);
      mesh.castShadow = true;
      scene.add(mesh);

      this.agents.push({
        mesh, baseX, baseZ,
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
