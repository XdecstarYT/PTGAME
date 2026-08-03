import { stationTier } from './stationDefs.js';
import { levelGridSize, createEmptyLevelGrid } from './stationModel.js';

// Shared by the famous-station starter galleries (famousStations.js,
// famousStationsBatch2.js): lays out `platformCount` parallel platform
// strips (with an adjoining waiting-area strip where there's room) across
// the grid's rows, entrances spaced along the top edge, an elevator for
// accessibility, and a scattering of amenities - the same shapes/ids the
// player's own brush paints with, just generated programmatically so a
// batch of named designs doesn't need cell-by-cell hand authoring.
export function generateLayout({ rows, cols, platformCount, entranceCount, amenities }) {
  const grid = createEmptyLevelGrid(cols, rows);
  const top = 2, bottom = 1;
  const usable = Math.max(1, rows - top - bottom);
  const slot = Math.max(2, Math.floor(usable / platformCount));

  for (let p = 0; p < platformCount; p++) {
    const platformRow = top + p * slot;
    if (platformRow >= rows - 1) break;
    for (let c = 2; c < cols - 2; c++) grid[platformRow][c] = 'platform';
    const waitRow = platformRow + 1;
    if (waitRow < rows - 1 && slot > 2) {
      const waitEnd = Math.min(cols - 3, 3 + Math.floor(cols * 0.25));
      for (let c = 3; c < waitEnd; c++) grid[waitRow][c] = 'waiting_area';
    }
  }

  const spacing = Math.max(2, Math.floor((cols - 4) / (entranceCount + 1)));
  for (let i = 0; i < entranceCount; i++) {
    const c = Math.min(cols - 3, 2 + spacing * (i + 1));
    grid[0][c] = 'entrance';
    if (grid[1]) grid[1][c] = 'turnstile';
  }

  if (grid[1]) grid[1][2] = 'elevator';
  let ax = 4;
  for (const item of amenities) {
    if (ax >= cols - 3) break;
    if (grid[1] && grid[1][ax] === 'empty') grid[1][ax] = item;
    ax += 2;
  }

  return grid;
}

export function buildFamousDesign({ name, typeId, tierId, architectureStyleId, platformCount, entranceCount, amenities }) {
  const tier = stationTier(tierId);
  const { rows, cols } = levelGridSize(tierId);
  return {
    id: null,
    name,
    typeId,
    tierId,
    w: tier.w,
    d: tier.d,
    architectureStyleId,
    levels: [{
      name: 'Ground Level', servedType: typeId,
      grid: generateLayout({ rows, cols, platformCount, entranceCount, amenities }),
    }],
    thumbnail: null,
    createdAt: Date.now(),
  };
}
