import * as THREE from 'three';

// Deterministic PRNG (mulberry32) so a given station always gets the same
// scatter of trees/props instead of jumping around every rebuild (tier
// upgrades rebuild the mesh in place).
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CANOPY_COLORS = [0x4c7a3a, 0x5a8a45, 0x3f6e34];

function tree(rand) {
  const group = new THREE.Group();
  const trunkH = 1.6 + rand() * 0.9;
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, trunkH, 6),
    new THREE.MeshStandardMaterial({ color: 0x5a3f2a, roughness: 0.9 }),
  );
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  group.add(trunk);

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.75 + rand() * 0.3, 8, 6),
    new THREE.MeshStandardMaterial({ color: CANOPY_COLORS[Math.floor(rand() * CANOPY_COLORS.length)], roughness: 0.85 }),
  );
  canopy.position.y = trunkH + 0.5;
  canopy.scale.y = 1.15;
  canopy.castShadow = true;
  group.add(canopy);
  return group;
}

function streetBench(style) {
  const group = new THREE.Group();
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x6b4a34, roughness: 0.8 });
  const legMat = new THREE.MeshStandardMaterial({ color: style?.trim ?? 0x2a2a2a, metalness: 0.4, roughness: 0.5 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.4), seatMat);
  seat.position.y = 0.45;
  seat.castShadow = true;
  group.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 0.05), seatMat);
  back.position.set(0, 0.7, -0.17);
  group.add(back);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.35), legMat);
    leg.position.set(side * 0.55, 0.22, 0);
    group.add(leg);
  }
  return group;
}

function lampPost(style) {
  const group = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: style?.trim ?? 0x2a2a2a, metalness: 0.5, roughness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.4, 8), poleMat);
  pole.position.y = 1.7;
  pole.castShadow = true;
  group.add(pole);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.14, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xfff3c9, emissive: 0xfff3c9, emissiveIntensity: 0.8 }),
  );
  lamp.position.y = 3.45;
  group.add(lamp);
  return group;
}

function pavingStrip(w, d) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.04, d),
    new THREE.MeshStandardMaterial({ color: 0x9a9a94, roughness: 0.95 }),
  );
  mesh.position.y = 0.02;
  mesh.receiveShadow = true;
  return mesh;
}

// Scatters a small, deterministic set of street furniture around a
// station's footprint pad - corner trees, and a paved apron with a bench
// and lamp post along the front (south, +Z) edge where the doorway faces.
// Purely decorative, positioned local to origin (0,0,0) at ground level;
// the caller offsets it to the station's world (x, 0, z).
export function buildLandscaping(footprintW, footprintD, seed, style) {
  const rand = mulberry32(Math.floor(seed) + 7);
  const group = new THREE.Group();

  const margin = 1.4;
  const corners = [
    [-footprintW / 2 - margin, -footprintD / 2 - margin],
    [footprintW / 2 + margin, -footprintD / 2 - margin],
    [-footprintW / 2 - margin, footprintD / 2 + margin],
    [footprintW / 2 + margin, footprintD / 2 + margin],
  ];
  for (const [cx, cz] of corners) {
    if (rand() < 0.15) continue; // occasionally skip one for variety
    const t = tree(rand);
    t.position.set(cx + (rand() - 0.5) * 0.6, 0, cz + (rand() - 0.5) * 0.6);
    t.rotation.y = rand() * Math.PI * 2;
    group.add(t);
  }

  // Paved apron along the front edge, with a bench and lamp post - matches
  // the side the doorway/name sign faces on every shell in architecture.js.
  const apronD = 2.2;
  const apron = pavingStrip(footprintW * 0.9, apronD);
  apron.position.set(0, 0, footprintD / 2 + apronD / 2 + 0.1);
  group.add(apron);

  const bench = streetBench(style);
  bench.position.set(-footprintW * 0.22, 0, footprintD / 2 + apronD * 0.65 + 0.1);
  bench.rotation.y = Math.PI;
  group.add(bench);

  const lamp = lampPost(style);
  lamp.position.set(footprintW * 0.28, 0, footprintD / 2 + apronD * 0.65 + 0.1);
  group.add(lamp);

  return group;
}
