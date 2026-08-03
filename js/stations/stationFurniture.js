import * as THREE from 'three';
import { LAYOUT_CELL_SIZE } from './stationDefs.js';

// Per-object-type walkable-scene geometry, one function per interior object
// id - ported from the standalone station-builder tool's furniture.js
// (station-builder/js/furniture.js), which has no dependency beyond
// LAYOUT_CELL_SIZE/THREE, so it transfers over verbatim. Everything is
// built local to a cell's footprint (a LAYOUT_CELL_SIZE cube centered on
// the origin) - stationWalk.js positions the returned group at the cell's
// world (x, y, z). Kept deliberately low-poly so a big station with
// hundreds of painted cells still renders cheaply.
const S = LAYOUT_CELL_SIZE;

function darker(hex, amt = 0.35) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - amt);
  return c;
}

function castAll(group) {
  group.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return group;
}

function benchMesh(color) {
  const group = new THREE.Group();
  const seatMat = new THREE.MeshStandardMaterial({ color });
  const legMat = new THREE.MeshStandardMaterial({ color: darker(color, 0.5) });

  const slatCount = 3;
  const slatW = (S * 0.85) / slatCount - 0.02;
  for (let i = 0; i < slatCount; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(slatW, 0.05, S * 0.4), seatMat);
    slat.position.set(-S * 0.85 / 2 + slatW / 2 + i * (slatW + 0.02), 0.45, 0);
    group.add(slat);
  }

  for (let i = 0; i < 2; i++) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(S * 0.85, 0.12, 0.04), seatMat);
    back.position.set(0, 0.58 + i * 0.16, -S * 0.18);
    group.add(back);
  }

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, S * 0.35), legMat);
    leg.position.set(side * S * 0.35, 0.225, 0);
    group.add(leg);
    const footRest = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, S * 0.38), legMat);
    footRest.position.set(side * S * 0.35, 0.05, 0);
    group.add(footRest);
  }
  return castAll(group);
}

function ticketMachineMesh(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.45, 1.3, S * 0.35),
    new THREE.MeshStandardMaterial({ color }),
  );
  body.position.set(0, 0.65, 0);
  group.add(body);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 0.28, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x2a3a4a, emissive: 0x4fa0d9, emissiveIntensity: 0.5 }),
  );
  screen.position.set(0, 0.95, S * 0.176);
  group.add(screen);

  const keyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const key = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), keyMat);
      key.position.set((c - 1) * 0.07, 0.68 + (1 - r) * 0.06, S * 0.176);
      group.add(key);
    }
  }
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.02, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a }),
  );
  slot.position.set(0, 0.42, S * 0.176);
  group.add(slot);
  return castAll(group);
}

function kioskMesh(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.8, 1.1, S * 0.8),
    new THREE.MeshStandardMaterial({ color }),
  );
  body.position.set(0, 0.55, 0);
  group.add(body);

  const window_ = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 0.55, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.25, metalness: 0.3 }),
  );
  window_.position.set(0, 0.72, S * 0.401);
  group.add(window_);
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.62, 0.04, 0.12),
    new THREE.MeshStandardMaterial({ color: darker(color, 0.15) }),
  );
  counter.position.set(0, 0.5, S * 0.44);
  group.add(counter);

  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(S * 1.05, 0.06, S * 1.05),
    new THREE.MeshStandardMaterial({ color: darker(color, 0.25) }),
  );
  awning.position.set(0, 1.15, 0);
  group.add(awning);
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.28, 0.03), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
    strut.position.set(side * S * 0.35, 1.0, S * 0.45);
    group.add(strut);
  }
  return castAll(group);
}

// Shared sign texture for the shop variants below - a short label on a
// solid backdrop, same canvas-decal technique used throughout this game
// for destination signs/depot signs/ad posters.
function signTexture(text, bg, fg) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function shopBodyMesh(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.78, 1.0, S * 0.78),
    new THREE.MeshStandardMaterial({ color }),
  );
  body.position.set(0, 0.5, 0);
  group.add(body);
  const window_ = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 0.5, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.25, metalness: 0.3 }),
  );
  window_.position.set(0, 0.65, S * 0.391);
  group.add(window_);
  return group;
}

function cafeMesh(color) {
  const group = shopBodyMesh(color);
  // Striped awning - alternating color bands via a repeating canvas texture.
  const stripeCanvas = document.createElement('canvas');
  stripeCanvas.width = 64; stripeCanvas.height = 16;
  const sctx = stripeCanvas.getContext('2d');
  for (let i = 0; i < 8; i++) {
    sctx.fillStyle = i % 2 === 0 ? '#a9714a' : '#f2e4cf';
    sctx.fillRect(i * 8, 0, 8, 16);
  }
  const stripeTex = new THREE.CanvasTexture(stripeCanvas);
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(S * 1.0, 0.3, 0.3),
    new THREE.MeshStandardMaterial({ map: stripeTex }),
  );
  awning.rotation.x = -0.5;
  awning.position.set(0, 1.05, S * 0.42);
  group.add(awning);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 0.55, 0.2),
    new THREE.MeshStandardMaterial({ map: signTexture('CAFÉ', '#3a2418', '#f2c98a') }),
  );
  sign.position.set(0, 1.25, S * 0.2);
  group.add(sign);
  return castAll(group);
}

function newsstandMesh(color) {
  const group = shopBodyMesh(color);
  const rackMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8 });
  const magColors = [0xd9528f, 0x4f7fd9, 0xc9a63d, 0x5fae6f];
  for (let i = 0; i < 4; i++) {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(S * 0.18, 0.24, 0.03), new THREE.MeshStandardMaterial({ color: magColors[i] }));
    mag.position.set(-S * 0.3 + i * (S * 0.2), 0.75, S * 0.4);
    mag.rotation.x = -0.15;
    group.add(mag);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(S * 0.9, 0.06, S * 0.9), new THREE.MeshStandardMaterial({ color: darker(color, 0.3) }));
  roof.position.set(0, 1.05, 0);
  group.add(roof);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 0.55, 0.2),
    new THREE.MeshStandardMaterial({ map: signTexture('NEWS', '#2a2a2a', '#f2c230') }),
  );
  sign.position.set(0, 1.0, S * 0.401);
  group.add(sign);
  return castAll(group);
}

function pharmacyMesh(color) {
  const group = shopBodyMesh(color);
  const crossMat = new THREE.MeshStandardMaterial({ color: 0x3ee06a, emissive: 0x3ee06a, emissiveIntensity: 0.5 });
  const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.04), crossMat);
  const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.04), crossMat);
  vBar.position.set(0, 1.15, S * 0.4);
  hBar.position.set(0, 1.15, S * 0.4);
  group.add(vBar, hBar);
  const backing = new THREE.Mesh(
    new THREE.CircleGeometry(0.24, 20),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  backing.position.set(0, 1.15, S * 0.39);
  group.add(backing);
  return castAll(group);
}

function techStoreMesh(color) {
  const group = new THREE.Group();
  // Glass-fronted body instead of the shared solid shopBodyMesh, to read
  // as sleeker/more modern than the other shop stalls.
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.78, 1.05, S * 0.78),
    new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2 }),
  );
  body.position.set(0, 0.525, 0);
  group.add(body);
  const frameMat = new THREE.MeshStandardMaterial({ color: darker(color, 0.5) });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.05), frameMat);
    post.position.set(side * S * 0.38, 0.525, S * 0.38);
    group.add(post);
  }
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(S * 0.6, 0.03, S * 0.4), frameMat);
  shelf.position.set(0, 0.6, 0);
  group.add(shelf);
  for (let i = 0; i < 3; i++) {
    const gadget = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.2, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x0c1420, emissive: 0x4fa0d9, emissiveIntensity: 0.4 }),
    );
    gadget.position.set(-S * 0.2 + i * (S * 0.2), 0.72, 0);
    group.add(gadget);
  }
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 0.6, 0.2),
    new THREE.MeshStandardMaterial({ map: signTexture('TECH', '#0c1420', '#4fa0d9'), emissive: 0xffffff, emissiveIntensity: 0.3 }),
  );
  sign.position.set(0, 1.15, S * 0.2);
  group.add(sign);
  return castAll(group);
}

function bookstoreMesh(color) {
  const group = shopBodyMesh(color);
  const bookColors = [0x8a4a35, 0x4a6fa5, 0x5fae6f, 0xc9a63d, 0x9d6fae];
  for (let i = 0; i < 5; i++) {
    const h = 0.28 + (i % 2) * 0.08;
    const book = new THREE.Mesh(new THREE.BoxGeometry(S * 0.13, h, 0.16), new THREE.MeshStandardMaterial({ color: bookColors[i] }));
    book.position.set(-S * 0.32 + i * (S * 0.16), h / 2 + 0.25, S * 0.28);
    group.add(book);
  }
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 0.55, 0.2),
    new THREE.MeshStandardMaterial({ map: signTexture('BOOKS', '#3a2a4a', '#e8d9f2') }),
  );
  sign.position.set(0, 1.05, S * 0.2);
  group.add(sign);
  return castAll(group);
}

function restroomMesh(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.9, 1.1, S * 0.9),
    new THREE.MeshStandardMaterial({ color }),
  );
  body.position.set(0, 0.55, 0);
  group.add(body);

  const doorMat = new THREE.MeshStandardMaterial({ color: darker(color, 0.4) });
  const door = new THREE.Mesh(new THREE.BoxGeometry(S * 0.36, 0.85, 0.03), doorMat);
  door.position.set(0, 0.5, S * 0.451);
  group.add(door);
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.1, 6),
    new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 0.7, roughness: 0.3 }),
  );
  handle.rotation.x = Math.PI / 2;
  handle.position.set(S * 0.15, 0.5, S * 0.47);
  group.add(handle);

  const sign = new THREE.Mesh(
    new THREE.CircleGeometry(0.12, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.2 }),
  );
  sign.position.set(0, 1.0, S * 0.451);
  group.add(sign);
  return castAll(group);
}

function infoBoardMesh(color) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.4, roughness: 0.5 }),
  );
  pole.position.set(0, 0.7, 0);
  group.add(pole);
  const poleBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.04, 12),
    new THREE.MeshStandardMaterial({ color: 0x555555 }),
  );
  poleBase.position.set(0, 0.02, 0);
  group.add(poleBase);

  const board = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.7, 0.5, 0.05),
    new THREE.MeshStandardMaterial({ color }),
  );
  board.position.set(0, 1.35, 0);
  group.add(board);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 0.6, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x0c1420, emissive: 0x5fa0d9, emissiveIntensity: 0.3 }),
  );
  screen.position.set(0, 1.35, 0.026);
  group.add(screen);
  return castAll(group);
}

function turnstileMesh(color) {
  const group = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: darker(color, 0.3) });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), postMat);
    post.position.set(side * S * 0.32, 0.5, 0);
    group.add(post);
    const reader = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.12, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x2a3a4a, emissive: 0x4fa0d9, emissiveIntensity: 0.4 }),
    );
    reader.position.set(side * S * 0.32, 0.75, 0.07);
    group.add(reader);
  }
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.64, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2 }),
  );
  arm.position.set(0, 0.85, 0);
  group.add(arm);
  return castAll(group);
}

function stairsMesh(color) {
  const group = new THREE.Group();
  const steps = 5;
  const mat = new THREE.MeshStandardMaterial({ color });
  const nosingMat = new THREE.MeshStandardMaterial({ color: darker(color, 0.4) });
  for (let i = 0; i < steps; i++) {
    const stepH = 0.5 * ((i + 1) / steps);
    const stepD = S / steps;
    const stepZ = -S / 2 + stepD * (i + 0.5);
    const step = new THREE.Mesh(new THREE.BoxGeometry(S * 0.9, stepH, stepD * 1.02), mat);
    step.position.set(0, stepH / 2, stepZ);
    group.add(step);
    const nosing = new THREE.Mesh(new THREE.BoxGeometry(S * 0.9, 0.02, 0.03), nosingMat);
    nosing.position.set(0, stepH + 0.01, stepZ + stepD * 0.49);
    group.add(nosing);
  }
  const railMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.5, roughness: 0.4 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, S * 1.05), railMat);
    rail.position.set(side * S * 0.47, 0.55, 0);
    rail.rotation.x = -0.42;
    group.add(rail);
  }
  return castAll(group);
}

function escalatorMesh(color) {
  const group = new THREE.Group();
  const ramp = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.9, 0.12, S * 1.2),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15 }),
  );
  ramp.rotation.x = -0.35;
  ramp.position.set(0, 0.12, 0);
  group.add(ramp);

  const ridgeMat = new THREE.MeshStandardMaterial({ color: darker(color, 0.3) });
  const ridgeCount = 8;
  for (let i = 0; i < ridgeCount; i++) {
    const t = (i + 0.5) / ridgeCount - 0.5;
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(S * 0.86, 0.03, 0.02), ridgeMat);
    ridge.position.set(0, 0.19, t * S * 1.15);
    ridge.rotation.x = -0.35;
    group.add(ridge);
  }

  const railMat = new THREE.MeshStandardMaterial({ color: darker(color, 0.2) });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, S * 1.25), railMat);
    rail.rotation.x = -0.35;
    rail.position.set(side * S * 0.45, 0.32, 0);
    group.add(rail);
  }
  return castAll(group);
}

function elevatorMesh(color) {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.9, 2.4, S * 0.9),
    new THREE.MeshStandardMaterial({ color: darker(color, 0.15) }),
  );
  shaft.position.set(0, 1.2, 0);
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

  const indicator = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x0c1420, emissive: 0xff8a3d, emissiveIntensity: 0.6 }),
  );
  indicator.position.set(0, 2.05, S * 0.451);
  group.add(indicator);
  return castAll(group);
}

function entranceMesh(color) {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(S * 0.6, 1.05, 0.05),
    new THREE.MeshStandardMaterial({ color: darker(color, 0.5) }),
  );
  frame.position.set(0, 0.55, S * 0.46);
  group.add(frame);

  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0c2a14';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#3ee06a';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXIT', canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(S * 0.5, S * 0.19),
    new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9 }),
  );
  sign.position.set(0, 1.25, S * 0.46);
  group.add(sign);
  return castAll(group);
}

// Hazard-stripe texture (diagonal yellow/black) for a platform edge facing
// a track - not part of the original standalone tool, added since the
// platform edge is the single most recognizable visual cue of a station.
let _hazardTex = null;
function hazardStripeTexture() {
  if (_hazardTex) return _hazardTex;
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#171514';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#f2c230';
  ctx.save();
  ctx.translate(32, 32);
  ctx.rotate(Math.PI / 4);
  ctx.translate(-32, -32);
  for (let x = -64; x < 128; x += 16) ctx.fillRect(x, 0, 8, 128);
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  _hazardTex = tex;
  return tex;
}

// A yellow/black hazard-stripe strip along one edge of a platform cell,
// facing whichever neighboring cell isn't itself a platform/waiting area
// (i.e. facing the track). `side` is 'north'|'south'|'east'|'west'.
export function buildPlatformEdgeStrip(side) {
  const tex = hazardStripeTexture();
  const stripW = S * 0.18;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
  const geo = (side === 'north' || side === 'south')
    ? new THREE.PlaneGeometry(S * 0.98, stripW)
    : new THREE.PlaneGeometry(stripW, S * 0.98);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  const off = S / 2 - stripW / 2;
  if (side === 'north') mesh.position.set(0, 0.015, -off);
  else if (side === 'south') mesh.position.set(0, 0.015, off);
  else if (side === 'west') mesh.position.set(-off, 0.015, 0);
  else mesh.position.set(off, 0.015, 0);
  return mesh;
}

const BUILDERS = {
  bench: benchMesh,
  ticket_machine: ticketMachineMesh,
  kiosk: kioskMesh,
  cafe: cafeMesh,
  newsstand: newsstandMesh,
  pharmacy: pharmacyMesh,
  tech_store: techStoreMesh,
  bookstore: bookstoreMesh,
  restroom: restroomMesh,
  info_board: infoBoardMesh,
  turnstile: turnstileMesh,
  stairs: stairsMesh,
  escalator: escalatorMesh,
  elevator: elevatorMesh,
  entrance: entranceMesh,
};

export function buildStationFurnitureMesh(id, color) {
  const builder = BUILDERS[id];
  return builder ? builder(color) : null;
}
