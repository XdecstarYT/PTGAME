import * as THREE from 'three';
import { STATION_CELL_SIZE, stationArchitectureStyle, stationDesignType } from './stationDefs.js';

// A deliberately simple exterior shell for a designed station - a footprint
// pad plus a boxy building volume that grows with level count, colored by
// the chosen architecture style. Not a port of the standalone station-builder
// tool's full architecture.js/furniture.js mesh system (walls-per-cell,
// glass panels, landscaping, etc) - that tool remains the place for a fully
// hand-crafted exterior. This just gives an in-game designed station a
// footprint-accurate, tier-appropriate silhouette instead of the bare
// pole+cap marker every station used to get.
//
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
