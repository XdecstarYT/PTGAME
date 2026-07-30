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
    voxels: [], // Phase 2: { x, y, z, materialId } in fine-grained local units
    thumbnail: null,
    createdAt: Date.now(),
  };
}
