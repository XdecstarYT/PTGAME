import * as THREE from 'three';
import { tierIndex } from './config.js';

// Type-specific exterior building shapes for placed stations, replacing a
// single flat-colored box with something that reads as the right kind of
// structure: an open shelter for bus/tram stops, a subway entrance pavilion,
// a gabled train shed for rail, a barrel-vaulted terminal for ferries, and a
// larger tiered hall for multi-modal interchanges. Scales with size tier but
// keeps the same silhouette family per type.

function darker(hex, amt = 0.3) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - amt);
  return c;
}

function windowBand(w, d, h, y, color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: darker(color, 0.55), roughness: 0.3, metalness: 0.1 });
  const bandH = Math.min(0.9, h * 0.3);
  const front = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, bandH, 0.04), mat);
  front.position.set(0, y, d / 2 + 0.02);
  group.add(front);
  const back = front.clone();
  back.position.z = -d / 2 - 0.02;
  group.add(back);
  return group;
}

// A recessed dark opening with a lighter frame trim, standing in for an
// actual entrance door instead of a flat painted-on rectangle. baseY lifts
// it to sit on top of the plinth rather than being buried inside it.
function doorway(w, h, z, baseY = 0.35) {
  const group = new THREE.Group();
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(w * 1.15, h * 1.08, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.5 }),
  );
  frame.position.set(0, baseY + h / 2, z);
  group.add(frame);
  const opening = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3 }),
  );
  opening.position.set(0, baseY + h / 2, z + 0.02);
  group.add(opening);
  return group;
}

// A slightly wider, darker foundation strip so the building looks grounded
// rather than floating on the pad.
function plinth(w, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w * 1.04, 0.35, d * 1.04),
    new THREE.MeshStandardMaterial({ color: darker(color, 0.45), roughness: 0.8 }),
  );
  mesh.position.y = 0.175;
  mesh.receiveShadow = true;
  return mesh;
}

// Renders a station's name onto a canvas texture (no font geometry needed)
// for a mounted sign board - real, if low-fidelity, signage.
function nameSign(text, w, y, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#12151a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#e8ecf1';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.fillStyle = '#f4d35e';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text).slice(0, 22), canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  const signW = Math.min(w * 0.55, 4.2);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(signW, signW * 0.25),
    new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25 }),
  );
  mesh.position.set(0, y, z);
  return mesh;
}

// Open-sided canopy shelter: bus/tram stops. Flat roof on corner posts,
// no walls.
function shelterShell(w, d, tier, name) {
  const group = new THREE.Group();
  const roofH = 2.6 + tierIndex(tier) * 0.3;
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6b6f76 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xe6e9ee, roughness: 0.6 });

  const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), roofMat);
  roof.position.set(0, roofH, 0);
  roof.castShadow = true;
  group.add(roof);
  // A thin fascia trim along the roof's leading edge for a less slab-like top.
  const fascia = new THREE.Mesh(
    new THREE.BoxGeometry(w * 1.01, 0.14, 0.08),
    new THREE.MeshStandardMaterial({ color: darker(0xe6e9ee, 0.2) }),
  );
  fascia.position.set(0, roofH - 0.05, d / 2);
  group.add(fascia);

  const postR = 0.08;
  const corners = [[-w / 2 + 0.3, -d / 2 + 0.3], [w / 2 - 0.3, -d / 2 + 0.3], [-w / 2 + 0.3, d / 2 - 0.3], [w / 2 - 0.3, d / 2 - 0.3]];
  for (const [px, pz] of corners) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, roofH, 8), postMat);
    post.position.set(px, roofH / 2, pz);
    post.castShadow = true;
    group.add(post);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(postR * 2.2, postR * 2.2, 0.06, 8), postMat);
    base.position.set(px, 0.03, pz);
    group.add(base);
  }

  // A single glazed back panel so it reads as a shelter, not a table.
  const backPanel = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.94, roofH * 0.7, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xcfd6e0, transparent: true, opacity: 0.55 }),
  );
  backPanel.position.set(0, roofH * 0.35, -d / 2 + 0.15);
  group.add(backPanel);

  group.add(nameSign(name, w, roofH + 0.35, -d / 2 + 0.16));
  return group;
}

// Small entrance pavilion + descending stairwell suggestion: subway.
function pavilionShell(w, d, tier, name) {
  const group = new THREE.Group();
  const h = 2.2 + tierIndex(tier) * 0.4;
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.7 });

  group.add(plinth(w * 0.58, d * 0.58, 0xf2f2f0));

  const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, h, d * 0.55), bodyMat);
  body.position.set(0, h / 2 + 0.35, 0);
  body.castShadow = true;
  group.add(body);

  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.65, 0.1, d * 0.65),
    new THREE.MeshStandardMaterial({ color: 0xe0552b, emissive: 0x441100, emissiveIntensity: 0.3 }),
  );
  canopy.position.set(0, h + 0.45, 0);
  canopy.castShadow = true;
  group.add(canopy);

  group.add(doorway(w * 0.28, h * 0.75, d * 0.275));

  // A dark sunken opening in front of the pavilion suggesting stairs down,
  // flanked by handrails.
  const opening = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.4, 0.05, d * 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a }),
  );
  opening.position.set(0, 0.38, d * 0.42);
  group.add(opening);
  const railMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, metalness: 0.6, roughness: 0.3 });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, d * 0.32), railMat);
    rail.position.set(side * w * 0.2, 0.6, d * 0.42);
    group.add(rail);
  }

  group.add(windowBand(w * 0.55, d * 0.55, h * 0.6, h * 0.55 + 0.35, 0x999999));
  group.add(nameSign(name, w * 0.65, h + 0.75, 0));
  return group;
}

// Gabled train-shed hall: rail stations.
function gabledHall(w, d, tier, name) {
  const group = new THREE.Group();
  const wallH = 3.2 + tierIndex(tier) * 1.2;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xede8df, roughness: 0.7 });

  group.add(plinth(w * 0.72, d * 0.72, 0xede8df));

  const walls = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, wallH, d * 0.72), wallMat);
  walls.position.set(0, wallH / 2 + 0.35, 0);
  walls.castShadow = true;
  group.add(walls);

  const roofMat = new THREE.MeshStandardMaterial({ color: 0x6f5f4a, roughness: 0.55 });
  const ridgeRise = wallH * 0.45;
  const slopeLen = Math.sqrt((d * 0.72 / 2) ** 2 + ridgeRise ** 2);
  const angle = Math.atan2(ridgeRise, d * 0.72 / 2);
  for (const side of [-1, 1]) {
    const slope = new THREE.Mesh(new THREE.BoxGeometry(w * 0.76, 0.1, slopeLen), roofMat);
    slope.position.set(0, wallH + 0.35 + ridgeRise / 2, side * (d * 0.72 / 4));
    slope.rotation.x = side * angle;
    slope.castShadow = true;
    group.add(slope);
  }

  // Visible roof trusses under the ridge, evenly spaced along the hall's
  // length, like a real train shed's structural frame.
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x3a3530, roughness: 0.6 });
  const trussCount = Math.max(2, Math.round((w * 0.72) / 6));
  for (let i = 0; i < trussCount; i++) {
    const tx = -w * 0.36 + (w * 0.72) * ((i + 0.5) / trussCount);
    for (const side of [-1, 1]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, slopeLen * 0.96), trussMat);
      brace.position.set(tx, wallH + 0.35 + ridgeRise / 2, side * (d * 0.72 / 4));
      brace.rotation.x = side * angle;
      group.add(brace);
    }
  }

  group.add(doorway(w * 0.16, wallH * 0.55, d * 0.36 + 0.03));
  group.add(windowBand(w * 0.72, d * 0.72, wallH * 0.6, wallH * 0.55 + 0.35, 0x8899aa));
  group.add(nameSign(name, w * 0.72, wallH + 0.9, d * 0.36 + 0.06));
  return group;
}

// Barrel-vaulted terminal hall: ferry terminals.
function vaultedHall(w, d, tier, name) {
  const group = new THREE.Group();
  const wallH = 2.6 + tierIndex(tier) * 1.0;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.65 });

  group.add(plinth(w * 0.7, d * 0.7, 0xe8ecef));

  const walls = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, wallH, d * 0.7), wallMat);
  walls.position.set(0, wallH / 2 + 0.35, 0);
  walls.castShadow = true;
  group.add(walls);

  const vaultR = (w * 0.7) / 2;
  const vault = new THREE.Mesh(
    new THREE.CylinderGeometry(vaultR, vaultR, d * 0.72, 16, 1, true, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x3d6ea5, roughness: 0.4, metalness: 0.15, side: THREE.DoubleSide }),
  );
  vault.rotation.z = Math.PI / 2;
  vault.rotation.y = Math.PI / 2;
  vault.position.set(0, wallH + 0.35, 0);
  vault.castShadow = true;
  group.add(vault);

  // Glazing ribs across the curved roof, evoking vault window bars.
  const ribMat = new THREE.MeshStandardMaterial({ color: 0x1f3a52, roughness: 0.5 });
  const ribCount = 6;
  for (let i = 1; i < ribCount; i++) {
    const t = i / ribCount;
    const angle2 = Math.PI * t;
    const rx = Math.cos(angle2) * vaultR;
    const ry = Math.sin(angle2) * vaultR;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, d * 0.74), ribMat);
    rib.position.set(rx, wallH + 0.35 + ry, 0);
    rib.rotation.z = angle2;
    group.add(rib);
  }

  group.add(doorway(w * 0.16, wallH * 0.6, d * 0.35 + 0.03));
  group.add(windowBand(w * 0.7, d * 0.7, wallH * 0.6, wallH * 0.5 + 0.35, 0x3d6ea5));
  group.add(nameSign(name, w * 0.7, wallH + 0.75, d * 0.35 + 0.06));
  return group;
}

// Larger tiered hall with a glass-canopy front overhang: interchanges.
function interchangeHall(w, d, tier, name) {
  const group = new THREE.Group();
  const baseH = 3.6 + tierIndex(tier) * 1.4;
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xece6f2, roughness: 0.6 });

  group.add(plinth(w * 0.75, d * 0.75, 0xece6f2));

  const base = new THREE.Mesh(new THREE.BoxGeometry(w * 0.75, baseH, d * 0.75), baseMat);
  base.position.set(0, baseH / 2 + 0.35, 0);
  base.castShadow = true;
  group.add(base);

  const upperH = baseH * 0.5;
  const upper = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.5, upperH, d * 0.5),
    new THREE.MeshStandardMaterial({ color: 0xb98fd8, roughness: 0.5 }),
  );
  upper.position.set(0, baseH + 0.35 + upperH / 2, 0);
  upper.castShadow = true;
  group.add(upper);

  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.85, 0.12, d * 0.3),
    new THREE.MeshStandardMaterial({ color: 0xb98fd8, transparent: true, opacity: 0.6, roughness: 0.2 }),
  );
  canopy.position.set(0, baseH * 0.62 + 0.35, d * 0.75 / 2 + d * 0.12);
  group.add(canopy);
  // Canopy support struts.
  const strutMat = new THREE.MeshStandardMaterial({ color: 0x6b6f76, metalness: 0.5, roughness: 0.4 });
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, baseH * 0.3, 0.06), strutMat);
    strut.position.set(side * w * 0.32, baseH * 0.47 + 0.35, d * 0.75 / 2 + d * 0.2);
    strut.rotation.x = -0.3;
    group.add(strut);
  }

  group.add(doorway(w * 0.2, baseH * 0.5, d * 0.375 + 0.03));
  group.add(windowBand(w * 0.75, d * 0.75, baseH * 0.6, baseH * 0.55 + 0.35, 0xb98fd8));
  group.add(nameSign(name, w * 0.75, baseH + 0.9, d * 0.375 + 0.06));
  return group;
}

const BUILDERS = {
  bus_stop: shelterShell,
  tram_stop: shelterShell,
  subway: pavilionShell,
  rail: gabledHall,
  ferry: vaultedHall,
  interchange: interchangeHall,
};

// Builds the exterior shell for a station of the given type/tier, sized to
// its footprint (w, d in meters). Positioned local to origin (0,0,0) - the
// caller places the returned group at the station's world (x,y,z).
export function buildStationShell(typeId, tierId, footprintW, footprintD, name = '') {
  const builder = BUILDERS[typeId] || gabledHall;
  return builder(footprintW, footprintD, tierId, name);
}
