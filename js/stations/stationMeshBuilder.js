import * as THREE from 'three';
import { STATION_CELL_SIZE, stationArchitectureStyle, stationDesignType } from './stationDefs.js';

// A deliberately simple exterior shell for a designed station - a footprint
// pad plus a boxy building volume that grows with level count, colored by
// the chosen architecture style. Not a port of the standalone station-builder
// tool's full architecture.js/furniture.js mesh system (walls-per-cell,
// glass panels, landscaping, etc) - that tool remains the place for a fully
// hand-crafted exterior. This just gives an in-game designed station a
// footprint-accurate, tier-appropriate silhouette instead of the bare
// pole+cap marker every station used to get. The "futuristic" style gets a
// distinct curved glass-canopy vault instead of the shared flat box+roof.

// A soft blue-sky-with-clouds canvas texture, reused by the futuristic
// canopy's glass roof (exterior) and its interior ceiling (stationWalk.js).
export function skyMuralTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#bfe6f2');
  grad.addColorStop(1, '#eef8fb');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  const puffs = [[40, 30], [90, 55], [150, 25], [200, 60], [30, 90], [180, 95]];
  for (const [cx, cy] of puffs) {
    for (let j = 0; j < 4; j++) {
      ctx.beginPath();
      ctx.ellipse(cx + j * 13 - 20, cy, 17, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A half-cylinder vault: extrusion runs along local X (length), the arch
// bulges upward from Y=0 (spring line) to Y=radius (apex), spanning the
// full width across Z in [-radius, radius]. Shared by the exterior shell
// and the interior walk-mode ceiling so both read as the same structure.
export function buildCanopyGeometry(lengthAlongX, spanZ, segments = 24) {
  const radius = spanZ / 2;
  const geo = new THREE.CylinderGeometry(radius, radius, lengthAlongX, segments, 1, true, -Math.PI / 2, Math.PI);
  geo.rotateZ(Math.PI / 2);
  return geo;
}

// A single arch rib spanning Z (width), positioned along X - used to space
// green structural ribs along a canopy's length.
export function buildRibGeometry(spanZ, tubeRadius) {
  const geo = new THREE.TorusGeometry(spanZ / 2, tubeRadius, 8, 24, Math.PI);
  geo.rotateY(Math.PI / 2);
  return geo;
}

function buildFuturisticCanopy(lengthAlongX, spanZ, style) {
  const group = new THREE.Group();

  const canopyGeo = buildCanopyGeometry(lengthAlongX, spanZ);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: style.roof, map: skyMuralTexture(), emissive: 0xffffff, emissiveMap: skyMuralTexture(),
    emissiveIntensity: 0.35, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    roughness: 0.15, metalness: 0.05,
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.receiveShadow = true;
  group.add(canopy);

  const ribCount = Math.max(3, Math.round(lengthAlongX / 4));
  const ribMat = new THREE.MeshStandardMaterial({ color: style.accent, emissive: style.accent, emissiveIntensity: 0.35, roughness: 0.4 });
  for (let i = 0; i < ribCount; i++) {
    const t = ribCount === 1 ? 0.5 : i / (ribCount - 1);
    const ribGeo = buildRibGeometry(spanZ, spanZ * 0.025);
    const rib = new THREE.Mesh(ribGeo, ribMat);
    rib.position.x = -lengthAlongX / 2 + t * lengthAlongX;
    rib.castShadow = true;
    group.add(rib);
  }

  return group;
}

// info: { typeId, tierId, architectureStyleId, w, d, levelCount } - a plain
// descriptor (not the full design with grids) so callers only need to keep
// the handful of scalar fields already stashed on the station object, not
// the whole design's interior layout.
export function buildStationShellMesh(info) {
  const group = new THREE.Group();
  const style = stationArchitectureStyle(info.architectureStyleId);
  const type = stationDesignType(info.typeId);
  const w = info.w * STATION_CELL_SIZE;
  const d = info.d * STATION_CELL_SIZE;
  const levelCount = info.levelCount || 1;
  const shellHeight = 3 + (levelCount - 1) * 2.6;

  const padGeo = new THREE.BoxGeometry(w, 0.3, d);
  const padMat = new THREE.MeshStandardMaterial({ color: type.color, roughness: 0.85 });
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.position.y = 0.15;
  pad.receiveShadow = true;
  group.add(pad);

  const shellW = w * 0.6, shellD = d * 0.6;

  if (style.id === 'futuristic') {
    const wallH = 1.6 + (levelCount - 1) * 2.4;
    const wallGeo = new THREE.BoxGeometry(shellW, wallH, shellD);
    const wallMat = new THREE.MeshStandardMaterial({
      color: style.wall, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.85,
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.y = 0.3 + wallH / 2;
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    const canopy = buildFuturisticCanopy(shellW, shellD, style);
    canopy.position.y = 0.3 + wallH;
    group.add(canopy);
    return group;
  }

  const wallGeo = new THREE.BoxGeometry(shellW, shellHeight, shellD);
  const wallMat = new THREE.MeshStandardMaterial({ color: style.wall, roughness: 0.7, metalness: 0.1 });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.y = 0.3 + shellHeight / 2;
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  const roofGeo = new THREE.BoxGeometry(shellW * 1.08, 0.4, shellD * 1.08);
  const roofMat = new THREE.MeshStandardMaterial({ color: style.roof, roughness: 0.6 });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = 0.3 + shellHeight + 0.2;
  roof.castShadow = true;
  group.add(roof);

  const accentGeo = new THREE.BoxGeometry(shellW * 1.02, 0.5, 0.15);
  const accentMat = new THREE.MeshStandardMaterial({ color: style.accent, emissive: style.accent, emissiveIntensity: 0.3 });
  const accent = new THREE.Mesh(accentGeo, accentMat);
  accent.position.set(0, 0.3 + shellHeight * 0.8, shellD / 2 + 0.08);
  group.add(accent);

  return group;
}
