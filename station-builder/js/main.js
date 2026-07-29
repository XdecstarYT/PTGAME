import * as THREE from 'three';
import { SceneManager } from './scene.js';
import { World } from './world.js';
import { PlacementSystem } from './placement.js';
import { UI } from './ui.js';
import { STARTING_BUDGET } from './config.js';

const canvas = document.getElementById('viewport');
const sceneManager = new SceneManager(canvas);

const world = new World();
sceneManager.scene.add(world.buildMeshes());

const economy = { budget: STARTING_BUDGET };

const placement = new PlacementSystem({ scene: sceneManager.scene, world, economy });
const ui = new UI({ placement, economy });
ui.setHint('Choose a station type & size, then click the map to place it.');

const pointer = new THREE.Vector2(-10, -10);
let pointerOverCanvas = false;

canvas.addEventListener('mousemove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  pointerOverCanvas = true;
});
canvas.addEventListener('mouseleave', () => { pointerOverCanvas = false; });

canvas.addEventListener('click', () => {
  if (!pointerOverCanvas || !placement.hover) return;
  const result = placement.confirmPlacement();
  if (result.ok) {
    ui.showToast(`Built ${result.station.name} (${'$' + result.station.cost.toLocaleString()})`);
    ui.refresh();
  } else {
    ui.showToast(result.reason, true);
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'r') { placement.toggleRotate(); ui.refresh(); }
});

function tick() {
  requestAnimationFrame(tick);
  if (pointerOverCanvas) {
    const point = sceneManager.groundIntersect(pointer.x, pointer.y, 0);
    placement.updateGhost(point);
    if (placement.hover) {
      ui.setHint(placement.hover.valid
        ? `Click to build here - ${placement.currentType.name} (${placement.currentTier.name}).`
        : placement.hover.reason);
    }
  } else {
    placement.ghostMesh.visible = false;
  }
  sceneManager.render();
}
tick();
