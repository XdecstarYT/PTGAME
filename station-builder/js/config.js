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

// ---------------- Layout editor (Phase 2) ----------------

// Interior objects are painted at a finer resolution than the outdoor
// placement grid - 1 layout cell = 1 meter, vs. CELL_SIZE=2m outdoors.
export const LAYOUT_CELL_SIZE = 1;

// category: 'platform' | 'circulation' | 'amenity' | 'entrance'
// walkable: whether a passenger/player can occupy this cell (used for the
// Phase 3 walk-mode collision map and for stat-engine pathing approximations).
export const INTERIOR_OBJECTS = [
  { id: 'empty', name: 'Erase', icon: '⬛', category: 'empty', color: '#2b2f38', cost: 0, walkable: true },
  { id: 'platform', name: 'Platform Edge', icon: '🟧', category: 'platform', color: '#d98a3d', cost: 400, walkable: true },
  { id: 'waiting_area', name: 'Waiting Area', icon: '🟩', category: 'amenity', color: '#6fae6f', cost: 150, walkable: true },
  { id: 'bench', name: 'Bench / Seating', icon: '🪑', category: 'amenity', color: '#a97c50', cost: 300, walkable: false },
  { id: 'ticket_machine', name: 'Ticket Machine', icon: '🎫', category: 'amenity', color: '#5b8ac9', cost: 2500, walkable: false },
  { id: 'turnstile', name: 'Turnstile / Gate', icon: '🚧', category: 'circulation', color: '#c9a63d', cost: 1800, walkable: true },
  { id: 'info_board', name: 'Information Board', icon: 'ℹ️', category: 'amenity', color: '#4a6fa5', cost: 600, walkable: false },
  { id: 'kiosk', name: 'Kiosk / Shop', icon: '🏪', category: 'amenity', color: '#c15fa0', cost: 8000, walkable: false },
  { id: 'restroom', name: 'Restroom', icon: '🚻', category: 'amenity', color: '#5fb0b0', cost: 12000, walkable: false },
  { id: 'entrance', name: 'Entrance / Exit', icon: '🚪', category: 'entrance', color: '#e8e8e8', cost: 1000, walkable: true },
  { id: 'stairs', name: 'Stairs', icon: '🪜', category: 'circulation', color: '#8f8f8f', cost: 4000, walkable: true },
  { id: 'escalator', name: 'Escalator', icon: '🔼', category: 'circulation', color: '#4fae8f', cost: 15000, walkable: true },
  { id: 'elevator', name: 'Elevator (accessible)', icon: '🛗', category: 'circulation', color: '#4f8fae', cost: 25000, walkable: true, accessible: true },
];

export function interiorObject(id) { return INTERIOR_OBJECTS.find(o => o.id === id); }

// Minimum entrance/exit count expected for a station's size tier.
export const MIN_ENTRANCES = { small: 1, medium: 2, large: 3, mega: 4 };

// Rough target passenger throughput (per hour) used only to contextualize
// the computed capacity stat - see docs/stat-formulas.md.
export const TARGET_THROUGHPUT = { small: 300, medium: 1200, large: 4000, mega: 9000 };

// Approximate consist/vehicle length (meters) a platform should fit for
// each station type, until this tool is wired up to the real vehicle
// designer's chassis dimensions.
export const REQUIRED_PLATFORM_LENGTH_M = {
  bus_stop: 14, tram_stop: 32, subway: 120, rail: 200, ferry: 60, interchange: 120,
};

// Cost (per footprint cell, i.e. per CELL_SIZE x CELL_SIZE area) to unlock
// each additional level beyond the first, up to the tier's maxLevels.
export const LEVEL_COST_PER_CELL = 500;
