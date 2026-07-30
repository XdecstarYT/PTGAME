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

// Open-sided canopy shelter: bus/tram stops. Flat roof on corner posts,
// no walls.
function shelterShell(w, d, tier) {
  const group = new THREE.Group();
  const roofH = 2.6 + tierIndex(tier) * 0.3;
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6b6f76 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xe6e9ee, roughness: 0.6 });

  const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), roofMat);
  roof.position.set(0, roofH, 0);
  roof.castShadow = true;
  group.add(roof);

  const postR = 0.08;
  const corners = [[-w / 2 + 0.3, -d / 2 + 0.3], [w / 2 - 0.3, -d / 2 + 0.3], [-w / 2 + 0.3, d / 2 - 0.3], [w / 2 - 0.3, d / 2 - 0.3]];
  for (const [px, pz] of corners) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, roofH, 8), postMat);
    post.position.set(px, roofH / 2, pz);
    post.castShadow = true;
    group.add(post);
  }

  // A single back panel so it reads as a shelter, not a table
  const backPanel = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.94, roofH * 0.7, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xcfd6e0, transparent: true, opacity: 0.55 }),
  );
  backPanel.position.set(0, roofH * 0.35, -d / 2 + 0.15);
  group.add(backPanel);

  return group;
}

// Small entrance pavilion + descending stairwell suggestion: subway.
function pavilionShell(w, d, tier) {
  const group = new THREE.Group();
  const h = 2.2 + tierIndex(tier) * 0.4;
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.7 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, h, d * 0.55), bodyMat);
  body.position.set(0, h / 2, 0);
  body.castShadow = true;
  group.add(body);

  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.65, 0.1, d * 0.65),
    new THREE.MeshStandardMaterial({ color: 0xe0552b, emissive: 0x441100, emissiveIntensity: 0.3 }),
  );
  canopy.position.set(0, h + 0.1, 0);
  canopy.castShadow = true;
  group.add(canopy);

  // A dark sunken opening in front of the pavilion suggesting stairs down.
  const opening = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.4, 0.05, d * 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a }),
  );
  opening.position.set(0, 0.03, d * 0.42);
  group.add(opening);

  group.add(windowBand(w * 0.55, d * 0.55, h * 0.6, h * 0.55, 0x999999));
  return group;
}

// Gabled train-shed hall: rail stations.
function gabledHall(w, d, tier) {
  const group = new THREE.Group();
  const wallH = 3.2 + tierIndex(tier) * 1.2;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xede8df, roughness: 0.7 });

  const walls = new THREE.Mesh(new THREE.BoxGeometry(w * 0.72, wallH, d * 0.72), wallMat);
  walls.position.set(0, wallH / 2, 0);
  walls.castShadow = true;
  group.add(walls);

  const roofMat = new THREE.MeshStandardMaterial({ color: 0x6f5f4a, roughness: 0.55 });
  const ridgeRise = wallH * 0.45;
  const slopeLen = Math.sqrt((d * 0.72 / 2) ** 2 + ridgeRise ** 2);
  const angle = Math.atan2(ridgeRise, d * 0.72 / 2);
  for (const side of [-1, 1]) {
    const slope = new THREE.Mesh(new THREE.BoxGeometry(w * 0.76, 0.1, slopeLen), roofMat);
    slope.position.set(0, wallH + ridgeRise / 2, side * (d * 0.72 / 4));
    slope.rotation.x = side * angle;
    slope.castShadow = true;
    group.add(slope);
  }

  group.add(windowBand(w * 0.72, d * 0.72, wallH * 0.6, wallH * 0.55, 0x8899aa));
  return group;
}

// Barrel-vaulted terminal hall: ferry terminals.
function vaultedHall(w, d, tier) {
  const group = new THREE.Group();
  const wallH = 2.6 + tierIndex(tier) * 1.0;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.65 });

  const walls = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, wallH, d * 0.7), wallMat);
  walls.position.set(0, wallH / 2, 0);
  walls.castShadow = true;
  group.add(walls);

  const vaultR = (w * 0.7) / 2;
  const vault = new THREE.Mesh(
    new THREE.CylinderGeometry(vaultR, vaultR, d * 0.72, 16, 1, true, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x3d6ea5, roughness: 0.4, metalness: 0.15, side: THREE.DoubleSide }),
  );
  vault.rotation.z = Math.PI / 2;
  vault.rotation.y = Math.PI / 2;
  vault.position.set(0, wallH, 0);
  vault.castShadow = true;
  group.add(vault);

  group.add(windowBand(w * 0.7, d * 0.7, wallH * 0.6, wallH * 0.5, 0x3d6ea5));
  return group;
}

// Larger tiered hall with a glass-canopy front overhang: interchanges.
function interchangeHall(w, d, tier) {
  const group = new THREE.Group();
  const baseH = 3.6 + tierIndex(tier) * 1.4;
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xece6f2, roughness: 0.6 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(w * 0.75, baseH, d * 0.75), baseMat);
  base.position.set(0, baseH / 2, 0);
  base.castShadow = true;
  group.add(base);

  const upperH = baseH * 0.5;
  const upper = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.5, upperH, d * 0.5),
    new THREE.MeshStandardMaterial({ color: 0xb98fd8, roughness: 0.5 }),
  );
  upper.position.set(0, baseH + upperH / 2, 0);
  upper.castShadow = true;
  group.add(upper);

  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.85, 0.12, d * 0.3),
    new THREE.MeshStandardMaterial({ color: 0xb98fd8, transparent: true, opacity: 0.6, roughness: 0.2 }),
  );
  canopy.position.set(0, baseH * 0.62, d * 0.75 / 2 + d * 0.12);
  group.add(canopy);

  group.add(windowBand(w * 0.75, d * 0.75, baseH * 0.6, baseH * 0.55, 0xb98fd8));
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
export function buildStationShell(typeId, tierId, footprintW, footprintD) {
  const builder = BUILDERS[typeId] || gabledHall;
  return builder(footprintW, footprintD, tierId);
}
