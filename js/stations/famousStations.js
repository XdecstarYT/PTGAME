import { stationTier } from './stationDefs.js';
import { levelGridSize, createEmptyLevelGrid } from './stationModel.js';

// A starter gallery of station designs loosely inspired by famous real-world
// terminals (Southern Cross, Flinders Street, Grand Central, etc) - not
// attempts at exact architectural replicas, just recognizably-themed
// layouts/tiers/styles built with this designer's own painting tools, so
// new players have a set of grand, ready-to-place stations instead of a
// blank gallery. Seeded into StationCatalog once, only if the catalog is
// otherwise empty - see stationCatalog.js.

// Lays out `platformCount` parallel platform strips (with an adjoining
// waiting-area strip where there's room) across the grid's rows, entrances
// spaced along the top edge, an elevator for accessibility, and a scattering
// of amenities - the same shapes/ids the player's own brush paints with,
// just generated programmatically so 15 designs don't need cell-by-cell
// hand authoring.
function generateLayout({ rows, cols, platformCount, entranceCount, amenities }) {
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

function buildFamousDesign({ name, typeId, tierId, architectureStyleId, platformCount, entranceCount, amenities }) {
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

const FAMOUS_STATION_SPECS = [
  {
    name: 'Southern Cross Station (Melbourne)', typeId: 'subway', tierId: 'mega', architectureStyleId: 'modern',
    platformCount: 6, entranceCount: 4, amenities: ['kiosk', 'kiosk', 'restroom', 'bench', 'bench', 'info_board'],
  },
  {
    name: 'Flinders Street Station (Melbourne)', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'restroom', 'bench', 'info_board'],
  },
  {
    name: 'Melbourne Central Station', typeId: 'subway', tierId: 'medium', architectureStyleId: 'modern',
    platformCount: 2, entranceCount: 2, amenities: ['kiosk', 'bench'],
  },
  {
    name: 'Bourke Street Mall Tram Interchange (Melbourne)', typeId: 'tram_stop', tierId: 'medium', architectureStyleId: 'minimal',
    platformCount: 2, entranceCount: 2, amenities: ['bench', 'info_board'],
  },
  {
    name: 'Grand Central Terminal (New York)', typeId: 'subway', tierId: 'mega', architectureStyleId: 'heritage',
    platformCount: 6, entranceCount: 4, amenities: ['kiosk', 'kiosk', 'restroom', 'restroom', 'bench', 'info_board'],
  },
  {
    name: "King's Cross Station (London)", typeId: 'subway', tierId: 'large', architectureStyleId: 'modern',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'bench', 'info_board'],
  },
  {
    name: 'St Pancras International (London)', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'restroom', 'bench'],
  },
  {
    name: 'Gare du Nord (Paris)', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'bench', 'info_board'],
  },
  {
    name: 'Tokyo Station (Marunouchi)', typeId: 'subway', tierId: 'mega', architectureStyleId: 'heritage',
    platformCount: 5, entranceCount: 4, amenities: ['kiosk', 'kiosk', 'restroom', 'bench', 'info_board'],
  },
  {
    name: 'Shinjuku Station (Tokyo)', typeId: 'subway', tierId: 'mega', architectureStyleId: 'futuristic',
    platformCount: 6, entranceCount: 5, amenities: ['kiosk', 'kiosk', 'restroom', 'bench', 'bench', 'info_board'],
  },
  {
    name: 'Kyoto Station', typeId: 'subway', tierId: 'mega', architectureStyleId: 'futuristic',
    platformCount: 5, entranceCount: 4, amenities: ['kiosk', 'restroom', 'bench', 'info_board'],
  },
  {
    name: 'Zürich Hauptbahnhof', typeId: 'subway', tierId: 'large', architectureStyleId: 'minimal',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'bench'],
  },
  {
    name: 'Antwerp Centraal ("Railway Cathedral")', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 3, entranceCount: 3, amenities: ['kiosk', 'restroom', 'bench'],
  },
  {
    name: 'Berlin Hauptbahnhof', typeId: 'subway', tierId: 'mega', architectureStyleId: 'futuristic',
    platformCount: 6, entranceCount: 4, amenities: ['kiosk', 'kiosk', 'restroom', 'bench', 'info_board'],
  },
  {
    name: 'Union Station (Washington, D.C.)', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'restroom', 'bench', 'info_board'],
  },
];

export function famousStationDesigns() {
  return FAMOUS_STATION_SPECS.map(buildFamousDesign);
}
