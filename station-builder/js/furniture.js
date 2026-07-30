import * as THREE from 'three';
import { LAYOUT_CELL_SIZE } from './config.js';

// Per-object-type walkable-scene geometry, one function per interior object
// id. Everything is built local to a cell's footprint (a LAYOUT_CELL_SIZE
// cube centered on the origin) - walkMode.js positions the returned group
// at the cell's world (x, y, z). Kept deliberately low-poly (a handful of
// primitives per object) so a big station with hundreds of painted cells
// still renders cheaply.
const S = LAYOUT_CELL_SIZE;

function darker(hex, amt = 0.35) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - amt);
  return c;
}

function benchMesh(color) {
  const group = new THREE.Group();
  const seatMat = new THREE.MeshStandardMaterial({ color });
  const legMat = new THREE.MeshStandardMaterial({ color: darker(color, 0.5) });

  const seat = new THREE.Mesh(new THREE.BoxGeometry(S * 0.85, 0.06, S * 0.4), seatMat);
  seat.position.set(0, 0.45, 0);
  group.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(S * 0.85, 0.4, 0.06), seatMat);
  back.position.set(0, 0.65, -S * 0.18);
  group.add(back);

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, S * 0.35), legMat);
    leg.position.set(side * S * 0.35, 0.225, 0);
    group.add(leg);
  }
  group.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return group;
}

function ticketMachineMesh(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.45, 1.3, S * 0.35),
    new THREE.MeshStandardMaterial({ color }),
  );
  body.position.set(0, 0.65, 0);
  body.castShadow = true;
  group.add(body);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 0.28, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x2a3a4a, emissive: 0x4fa0d9, emissiveIntensity: 0.5 }),
  );
  screen.position.set(0, 0.95, S * 0.176);
  group.add(screen);
  return group;
}

function kioskMesh(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.8, 1.1, S * 0.8),
    new THREE.MeshStandardMaterial({ color }),
  );
  body.position.set(0, 0.55, 0);
  body.castShadow = true;
  group.add(body);

  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(S * 1.05, 0.06, S * 1.05),
    new THREE.MeshStandardMaterial({ color: darker(color, 0.25) }),
  );
  awning.position.set(0, 1.15, 0);
  awning.castShadow = true;
  group.add(awning);
  return group;
}

function restroomMesh(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.9, 1.1, S * 0.9),
    new THREE.MeshStandardMaterial({ color }),
  );
  body.position.set(0, 0.55, 0);
  body.castShadow = true;
  group.add(body);

  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 0.35, 0.85),
    new THREE.MeshStandardMaterial({ color: darker(color, 0.4) }),
  );
  door.position.set(0, 0.5, S * 0.451);
  group.add(door);

  const sign = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.2 }),
  );
  sign.position.set(0, 1.0, S * 0.451);
  group.add(sign);
  return group;
}

function infoBoardMesh(color) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a8a8a }),
  );
  pole.position.set(0, 0.7, 0);
  pole.castShadow = true;
  group.add(pole);

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.7, 0.5, 0.05),
    new THREE.MeshStandardMaterial({ color }),
  );
  board.position.set(0, 1.35, 0);
  board.castShadow = true;
  group.add(board);
  return group;
}

function turnstileMesh(color) {
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: darker(color, 0.3) });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), postMat);
    post.position.set(side * S * 0.32, 0.5, 0);
    post.castShadow = true;
    group.add(post);
  }
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.64, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 }),
  );
  arm.position.set(0, 0.85, 0);
  group.add(arm);
  return group;
}

function stairsMesh(color) {
  const group = new THREE.Group();
  const steps = 5;
  const mat = new THREE.MeshStandardMaterial({ color });
  for (let i = 0; i < steps; i++) {
    const stepH = 0.5 * ((i + 1) / steps);
    const stepD = S / steps;
    const step = new THREE.Mesh(new THREE.BoxGeometry(S * 0.9, stepH, stepD * 1.02), mat);
    step.position.set(0, stepH / 2, -S / 2 + stepD * (i + 0.5));
    step.castShadow = true;
    group.add(step);
  }
  return group;
}

function escalatorMesh(color) {
  const group = new THREE.Group();
  const ramp = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.9, 0.12, S * 1.2),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15 }),
  );
  ramp.rotation.x = -0.35;
  ramp.position.set(0, 0.12, 0);
  ramp.castShadow = true;
  group.add(ramp);

  const railMat = new THREE.MeshStandardMaterial({ color: darker(color, 0.2) });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, S * 1.25), railMat);
    rail.rotation.x = -0.35;
    rail.position.set(side * S * 0.45, 0.32, 0);
    group.add(rail);
  }
  return group;
}

function elevatorMesh(color) {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.9, 2.4, S * 0.9),
    new THREE.MeshStandardMaterial({ color: darker(color, 0.15) }),
  );
  shaft.position.set(0, 1.2, 0);
  shaft.castShadow = true;
  group.add(shaft);

  const doorSeam = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 2.0, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a }),
  );
  doorSeam.position.set(0, 1.0, S * 0.451);
  group.add(doorSeam);

  const button = new THREE.Mesh(
    new THREE.CircleGeometry(0.06, 12),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 }),
  );
  button.position.set(S * 0.4, 1.1, S * 0.451);
  group.add(button);
  return group;
}

const BUILDERS = {
  bench: benchMesh,
  ticket_machine: ticketMachineMesh,
  kiosk: kioskMesh,
  restroom: restroomMesh,
  info_board: infoBoardMesh,
  turnstile: turnstileMesh,
  stairs: stairsMesh,
  escalator: escalatorMesh,
  elevator: elevatorMesh,
};

export function buildFurnitureMesh(id, color) {
  const builder = BUILDERS[id];
  return builder ? builder(color) : null;
}
