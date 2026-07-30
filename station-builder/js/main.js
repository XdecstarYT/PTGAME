import * as THREE from 'three';
import { SceneManager } from './scene.js';
import { World } from './world.js';
import { PlacementSystem } from './placement.js';
import { LayoutEditor } from './layoutEditor.js';
import { WalkController } from './walkMode.js';
import { UI } from './ui.js';
import { STARTING_BUDGET } from './config.js';

const canvas = document.getElementById('viewport');
const sceneManager = new SceneManager(canvas);

const world = new World();
const worldGroup = world.buildMeshes();
sceneManager.scene.add(worldGroup);

const economy = { budget: STARTING_BUDGET };

const placement = new PlacementSystem({ scene: sceneManager.scene, world, economy });
const ui = new UI({ placement, economy });
ui.setHint('Choose a station type & size, then click the map to place it. Click an existing station to edit its interior.');

let mode = 'placement'; // 'placement' | 'edit' | 'walk'
let editingStation = null;

const layoutEditor = new LayoutEditor(document.getElementById('layout-canvas'), {
  economy,
  onChange: () => { if (editingStation) ui.refreshEditorStats(editingStation); },
  onInsufficientFunds: (obj) => ui.showToast(`Not enough budget for ${obj.name}.`, true),
});

function setOutdoorVisible(visible) {
  worldGroup.visible = visible;
  for (const s of placement.stations) s.mesh.visible = visible;
}

// The editor overlay has its own opaque backdrop that occludes these, but
// walk mode renders straight into the shared 3D viewport with no backdrop
// of its own, so the placement HUD needs to be hidden explicitly.
const baseHud = ['topbar', 'toolbar', 'hint-banner'].map(id => document.getElementById(id));
function setBaseHudVisible(visible) {
  for (const el of baseHud) el.classList.toggle('hidden', !visible);
}

const walkController = new WalkController({
  sceneManager,
  onExit: (station) => {
    setOutdoorVisible(true);
    ui.hideWalkHud();
    enterEditor(station);
  },
});

function enterEditor(station) {
  mode = 'edit';
  editingStation = station;
  setBaseHudVisible(false);
  layoutEditor.setStation(station);
  ui.showEditor(station, layoutEditor);
}

function exitEditor() {
  mode = 'placement';
  editingStation = null;
  setBaseHudVisible(true);
  ui.hideEditor();
}

document.getElementById('btn-editor-back').addEventListener('click', exitEditor);

document.getElementById('btn-walk-mode').addEventListener('click', () => {
  if (!editingStation) return;
  mode = 'walk';
  ui.hideEditor();
  setOutdoorVisible(false);
  ui.showWalkHud();
  walkController.enter(editingStation, layoutEditor.activeLevel);
});
document.getElementById('btn-walkmode-back').addEventListener('click', () => walkController.exit());

const pointer = new THREE.Vector2(-10, -10);
let pointerOverCanvas = false;
const raycaster = new THREE.Raycaster();

canvas.addEventListener('mousemove', (e) => {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  pointerOverCanvas = true;
});
canvas.addEventListener('mouseleave', () => { pointerOverCanvas = false; });

canvas.addEventListener('click', () => {
  if (mode !== 'placement' || !pointerOverCanvas) return;

  raycaster.setFromCamera(pointer, sceneManager.camera);
  const meshes = placement.stations.map(s => s.mesh);
  const hits = raycaster.intersectObjects(meshes, true);
  if (hits.length) {
    const station = placement.stations.find(s => s.mesh.children.includes(hits[0].object));
    if (station) { enterEditor(station); return; }
  }

  if (!placement.hover) return;
  const result = placement.confirmPlacement();
  if (result.ok) {
    ui.showToast(`Built ${result.station.name} (${'$' + result.station.cost.toLocaleString()})`);
    ui.refresh();
  } else {
    ui.showToast(result.reason, true);
  }
});

window.addEventListener('keydown', (e) => {
  if (mode === 'placement' && e.key.toLowerCase() === 'r') { placement.toggleRotate(); ui.refresh(); }
  if (mode === 'edit' && e.key === 'Escape') exitEditor();
});

let lastT = performance.now();
function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;

  if (mode === 'placement') {
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
  } else if (mode === 'walk') {
    walkController.update(dt);
  }
  sceneManager.render();
}
tick();
