import { stationTier, STATION_CELL_SIZE, LAYOUT_CELL_SIZE } from './stationDefs.js';

export function levelGridSize(tierId) {
  const tier = stationTier(tierId);
  return {
    rows: Math.round((tier.d * STATION_CELL_SIZE) / LAYOUT_CELL_SIZE),
    cols: Math.round((tier.w * STATION_CELL_SIZE) / LAYOUT_CELL_SIZE),
  };
}

export function createEmptyLevelGrid(cols, rows) {
  return Array.from({ length: rows }, () => Array(cols).fill('empty'));
}

export function createDefaultStationDesign(typeId, tierId = 'small') {
  const tier = stationTier(tierId);
  const { rows, cols } = levelGridSize(tierId);
  return {
    id: null,
    name: `${tier.name}`,
    typeId,
    tierId,
    w: tier.w,
    d: tier.d,
    architectureStyleId: 'modern',
    levels: [{ name: 'Ground Level', servedType: typeId, grid: createEmptyLevelGrid(cols, rows) }],
    thumbnail: null,
    createdAt: Date.now(),
  };
}

// Grows every level's grid to match the design's current (already-updated)
// w/d, keeping existing painted cells anchored at their original top-left
// position. Called right after a tier upgrade resizes design.w/design.d.
export function resizeStationLevelGrids(design) {
  const { rows: newRows, cols: newCols } = levelGridSize(design.tierId);
  for (const level of design.levels) {
    const oldGrid = level.grid;
    const newGrid = [];
    for (let r = 0; r < newRows; r++) {
      const row = [];
      for (let c = 0; c < newCols; c++) row.push(oldGrid[r]?.[c] ?? 'empty');
      newGrid.push(row);
    }
    level.grid = newGrid;
  }
}

export function addStationLevel(design) {
  const tier = stationTier(design.tierId);
  if (design.levels.length >= tier.maxLevels) return false;
  const { rows, cols } = levelGridSize(design.tierId);
  design.levels.push({ name: `Level ${design.levels.length + 1}`, servedType: design.typeId, grid: createEmptyLevelGrid(cols, rows) });
  return true;
}

export function removeStationLevel(design) {
  if (design.levels.length <= 1) return false;
  design.levels.pop();
  return true;
}
