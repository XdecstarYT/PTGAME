import * as THREE from 'three';
import { STATION_CELL_SIZE, LAYOUT_CELL_SIZE, stationArchitectureStyle, stationDesignType, stationInteriorObject } from './stationDefs.js';
import { buildStationFurnitureMesh, buildPlatformEdgeStrip } from './stationFurniture.js';

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

// ---------------- real interior room (walk mode + freeform layout editing) ----------------

const INTERIOR_WALL_HEIGHT = 3;

function adPosterTexture(title, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 192; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.fillStyle = color;
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// World-space origin (near/top-left corner of cell 0,0) for a level's
// interior grid, centered on the room's footprint - the single source of
// truth for grid<->world conversion shared by walk mode's collision/movement
// and the layout editor's freeform placement.
export function interiorOrigin(design, levelIndex) {
  const grid = design.levels[levelIndex].grid;
  const cols = grid[0].length, rows = grid.length;
  return { x: -cols * LAYOUT_CELL_SIZE / 2, y: 0, z: -rows * LAYOUT_CELL_SIZE / 2, rows, cols };
}

// Builds the real, full-size walkable room for one station level - floor,
// furniture/shop meshes, platform hazard stripes, walls, and a ceiling (or,
// for the "futuristic" style, the same glass-canopy vault as the exterior
// shell) - used by both StationWalkController (walk mode) and the Station
// Designer's live layout-editing preview, so what you click while editing is
// exactly what you'd see walking through it. Every per-cell mesh (and the
// floor slab itself) is tagged with userData so the freeform placement
// engine can resolve a raycast hit straight back to a grid cell.
//
// `includeCeiling` defaults to true (walk mode wants a real ceiling
// overhead). The layout editor's top-down/orbiting preview camera sits
// outside and above the room, where an opaque ceiling would hide everything
// below it - so it passes false for an open-top "dollhouse" view instead.
export function buildStationInteriorGroup(design, levelIndex, { includeCeiling = true } = {}) {
  const group = new THREE.Group();
  const grid = design.levels[levelIndex].grid;
  const rows = grid.length, cols = grid[0].length;
  const o = interiorOrigin(design, levelIndex);
  const w = cols * LAYOUT_CELL_SIZE, d = rows * LAYOUT_CELL_SIZE;
  const style = stationArchitectureStyle(design.architectureStyleId);
  const isFuturistic = style.id === 'futuristic';

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: isFuturistic ? 0xe8ece6 : 0xcfd3da, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(o.x + w / 2, o.y, o.z + d / 2);
  floor.receiveShadow = true;
  floor.userData = { isInteriorFloor: true, levelIndex };
  group.add(floor);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = grid[r][c];
      if (id === 'empty') continue;
      const obj = stationInteriorObject(id);
      const cx = o.x + (c + 0.5) * LAYOUT_CELL_SIZE;
      const cz = o.z + (r + 0.5) * LAYOUT_CELL_SIZE;
      const cellTag = { isInteriorCell: true, levelIndex, row: r, col: c };

      const furniture = buildStationFurnitureMesh(id, obj.color);
      if (furniture) {
        furniture.position.set(cx, o.y, cz);
        furniture.traverse((n) => { n.userData = cellTag; });
        group.add(furniture);
        if (obj.category === 'circulation') {
          const decal = new THREE.Mesh(
            new THREE.PlaneGeometry(LAYOUT_CELL_SIZE * 0.94, LAYOUT_CELL_SIZE * 0.94),
            new THREE.MeshStandardMaterial({ color: obj.color }),
          );
          decal.rotation.x = -Math.PI / 2;
          decal.position.set(cx, o.y + 0.02, cz);
          decal.userData = cellTag;
          group.add(decal);
        }
      } else {
        const decal = new THREE.Mesh(
          new THREE.PlaneGeometry(LAYOUT_CELL_SIZE * 0.94, LAYOUT_CELL_SIZE * 0.94),
          new THREE.MeshStandardMaterial({ color: obj.color }),
        );
        decal.rotation.x = -Math.PI / 2;
        decal.position.set(cx, o.y + 0.02, cz);
        decal.userData = cellTag;
        group.add(decal);
      }

      // Platform cells get a yellow/black hazard strip along whichever
      // edges face something other than more platform/waiting-area -
      // i.e. the edge(s) that would face a track.
      if (id === 'platform') {
        const neighbors = [
          ['north', r - 1, c], ['south', r + 1, c], ['west', r, c - 1], ['east', r, c + 1],
        ];
        for (const [side, nr, nc] of neighbors) {
          const outOfBounds = nr < 0 || nc < 0 || nr >= rows || nc >= cols;
          const neighborId = outOfBounds ? null : grid[nr][nc];
          const facesTrack = outOfBounds || (neighborId !== 'platform' && neighborId !== 'waiting_area');
          if (!facesTrack) continue;
          const strip = buildPlatformEdgeStrip(side);
          strip.position.x += cx;
          strip.position.z += cz;
          strip.userData = cellTag;
          group.add(strip);
        }
      }
    }
  }

  const wallMat = new THREE.MeshStandardMaterial({
    color: isFuturistic ? style.wall : 0xe8e8e8,
    transparent: isFuturistic, opacity: isFuturistic ? 0.35 : 1,
    roughness: isFuturistic ? 0.15 : 0.85,
  });
  const wallThickness = 0.2;
  const northWall = new THREE.Mesh(new THREE.BoxGeometry(w, INTERIOR_WALL_HEIGHT, wallThickness), wallMat);
  northWall.position.set(o.x + w / 2, o.y + INTERIOR_WALL_HEIGHT / 2, o.z);
  const southWall = northWall.clone();
  southWall.position.z = o.z + d;
  const westWall = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, INTERIOR_WALL_HEIGHT, d), wallMat);
  westWall.position.set(o.x, o.y + INTERIOR_WALL_HEIGHT / 2, o.z + d / 2);
  const eastWall = westWall.clone();
  eastWall.position.x = o.x + w;
  group.add(northWall, southWall, westWall, eastWall);

  if (includeCeiling && isFuturistic) {
    const canopyGeo = buildCanopyGeometry(w, d, 28);
    const canopyMat = new THREE.MeshStandardMaterial({
      color: style.roof, map: skyMuralTexture(), emissive: 0xffffff, emissiveMap: skyMuralTexture(),
      emissiveIntensity: 0.5, transparent: true, opacity: 0.5, side: THREE.DoubleSide, roughness: 0.1,
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    // buildCanopyGeometry already runs its length along local X and its
    // arc across local Z, matching this room's (w=cols=X, d=rows=Z)
    // convention directly - no extra rotation needed here.
    canopy.position.set(o.x + w / 2, o.y + INTERIOR_WALL_HEIGHT, o.z + d / 2);
    group.add(canopy);

    const ribMat = new THREE.MeshStandardMaterial({ color: style.accent, emissive: style.accent, emissiveIntensity: 0.4, roughness: 0.4 });
    const ribCount = Math.max(3, Math.round(w / 4));
    for (let i = 0; i < ribCount; i++) {
      const t = ribCount === 1 ? 0.5 : i / (ribCount - 1);
      // buildRibGeometry already arcs across Z (spanZ) - spacing copies
      // along X gives the same ribbed-vault look as the exterior shell.
      const ribGeo = buildRibGeometry(d, d * 0.02);
      const rib = new THREE.Mesh(ribGeo, ribMat);
      rib.position.set(o.x + t * w, o.y + INTERIOR_WALL_HEIGHT, o.z + d / 2);
      rib.castShadow = true;
      group.add(rib);
    }

    // Ad posters along the north wall, evenly spaced.
    const posterTitles = ['IRIS', 'NOW\nBOARDING', 'CITY\nGUIDE'];
    const posterColors = ['#2f7a45', '#4aa3c7', '#c9a63d'];
    for (let i = 0; i < 3; i++) {
      const tex = adPosterTexture(posterTitles[i], posterColors[i]);
      const poster = new THREE.Mesh(
        new THREE.PlaneGeometry(1.1, 1.5),
        new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }),
      );
      poster.position.set(o.x + w * ((i + 1) / 4), o.y + 1.6, o.z + 0.11);
      group.add(poster);
    }
  } else if (includeCeiling) {
    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: 0xf2f0eb, roughness: 0.95, side: THREE.DoubleSide }),
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(o.x + w / 2, o.y + INTERIOR_WALL_HEIGHT, o.z + d / 2);
    group.add(ceiling);
  }

  return group;
}
