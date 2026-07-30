import { footprintPreset } from './buildingDefs.js';

export function createEmptyLevelGrid(cols, rows) {
  return Array.from({ length: rows }, () => Array(cols).fill('empty'));
}

export function createDefaultBuildingDesign(footprintId) {
  const preset = footprintPreset(footprintId);
  return {
    id: null,
    name: `${preset.label} Building`,
    footprintId: preset.id,
    cols: preset.cols,
    rows: preset.rows,
    levels: [{ grid: createEmptyLevelGrid(preset.cols, preset.rows), wallMaterialId: 'concrete' }],
    voxels: [], // { x, y, z, materialId } in VOXEL_SIZE units - see buildingDefs.js
    thumbnail: null,
    createdAt: Date.now(),
  };
}

// ---------------- voxel decoration layer (Phase 2) ----------------

export function voxelKey(x, y, z) { return `${x},${y},${z}`; }

export function findVoxel(design, x, y, z) {
  const key = voxelKey(x, y, z);
  return design.voxels.find(v => voxelKey(v.x, v.y, v.z) === key);
}

// Adds a voxel at the given integer coordinate, or repaints it if one is
// already there. Returns false (no-op) if the coordinate is already exactly
// occupied by the same material, so callers can skip a pointless rebuild.
export function addVoxel(design, x, y, z, materialId) {
  const existing = findVoxel(design, x, y, z);
  if (existing) {
    if (existing.materialId === materialId) return false;
    existing.materialId = materialId;
    return true;
  }
  design.voxels.push({ x, y, z, materialId });
  return true;
}

export function removeVoxelAt(design, x, y, z) {
  const key = voxelKey(x, y, z);
  const idx = design.voxels.findIndex(v => voxelKey(v.x, v.y, v.z) === key);
  if (idx < 0) return false;
  design.voxels.splice(idx, 1);
  return true;
}
