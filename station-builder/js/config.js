// Core tunables for the standalone station builder. Kept separate from the
// main transit game's config so this tool can run fully on its own; a future
// integration pass can map these onto the main game's network/economy types.

export const CELL_SIZE = 2; // meters per grid cell
export const WORLD_CELLS = 100; // world is WORLD_CELLS x WORLD_CELLS cells

export const STARTING_BUDGET = 2_000_000;

// Size tiers: footprint dimensions in grid cells, and a cost multiplier
// applied on top of each station type's per-cell base cost.
export const SIZE_TIERS = [
  { id: 'small', name: 'Small Stop', w: 8, d: 6, costMult: 1, maxLevels: 1 },
  { id: 'medium', name: 'Medium Station', w: 14, d: 10, costMult: 1, maxLevels: 1 },
  { id: 'large', name: 'Large Terminal', w: 24, d: 16, costMult: 1, maxLevels: 2 },
  { id: 'mega', name: 'Mega Interchange Hub', w: 36, d: 24, costMult: 1, maxLevels: 3 },
];

export function tierIndex(tierId) { return SIZE_TIERS.findIndex(t => t.id === tierId); }
export function nextTier(tierId) {
  const i = tierIndex(tierId);
  return i >= 0 && i < SIZE_TIERS.length - 1 ? SIZE_TIERS[i + 1] : null;
}

// Station types: access rule says what map feature the footprint must sit
// near in order to be buildable there.
export const STATION_TYPES = [
  {
    id: 'bus_stop', name: 'Bus Stop', icon: '🚌',
    accessRule: 'road', costPerCell: 900, color: 0xd9a441,
  },
  {
    id: 'tram_stop', name: 'Tram Stop', icon: '🚊',
    accessRule: 'road', costPerCell: 1100, color: 0x4aa3c7,
  },
  {
    id: 'subway', name: 'Subway / Metro Station', icon: '🚇',
    accessRule: 'tunnel', costPerCell: 2600, color: 0xe0552b,
  },
  {
    id: 'rail', name: 'Rail Station', icon: '🚆',
    accessRule: 'rail', costPerCell: 2100, color: 0x5f7d4f,
  },
  {
    id: 'ferry', name: 'Ferry Terminal', icon: '⛴️',
    accessRule: 'water', costPerCell: 1800, color: 0x3d6ea5,
  },
  {
    id: 'interchange', name: 'Multi-Modal Interchange', icon: '🏢',
    accessRule: 'any', costPerCell: 3400, color: 0xb98fd8,
  },
];

export function stationType(id) { return STATION_TYPES.find(t => t.id === id); }

// How close (in cells) a footprint edge must be to the relevant map feature
// for placement to be considered valid.
export const ACCESS_TOLERANCE_CELLS = 2;
