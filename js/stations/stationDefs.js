// Station design data layer - ported from the standalone station-builder
// tool's config.js so the main game can design/place real stations without
// depending on that separate app. Kept as plain data + pure functions, same
// as buildingDefs.js/chassisDefs.js, so it composes with the existing
// catalog/editor/mesh-builder pattern used throughout the designer suite.

export const LAYOUT_CELL_SIZE = 1; // meters per interior grid cell
export const STATION_CELL_SIZE = 2; // meters per footprint "tier" cell (w/d units below)

export const STATION_SIZE_TIERS = [
  { id: 'small', name: 'Small Stop', w: 8, d: 6, maxLevels: 1 },
  { id: 'medium', name: 'Medium Station', w: 14, d: 10, maxLevels: 1 },
  { id: 'large', name: 'Large Terminal', w: 24, d: 16, maxLevels: 2 },
  { id: 'mega', name: 'Mega Interchange Hub', w: 36, d: 24, maxLevels: 3 },
];

export function stationTier(id) { return STATION_SIZE_TIERS.find(t => t.id === id) || STATION_SIZE_TIERS[0]; }
export function tierIndex(tierId) { return STATION_SIZE_TIERS.findIndex(t => t.id === tierId); }
export function nextStationTier(tierId) {
  const i = tierIndex(tierId);
  return i >= 0 && i < STATION_SIZE_TIERS.length - 1 ? STATION_SIZE_TIERS[i + 1] : null;
}

export const STATION_DESIGN_TYPES = [
  { id: 'bus_stop', name: 'Bus Stop', icon: '🚌', category: 'bus', costPerCell: 900, color: 0xd9a441 },
  { id: 'tram_stop', name: 'Tram Stop', icon: '🚊', category: 'tram', costPerCell: 1100, color: 0x4aa3c7 },
  { id: 'subway', name: 'Subway / Metro Station', icon: '🚇', category: 'subway', costPerCell: 2600, color: 0xe0552b },
];

export function stationDesignType(id) { return STATION_DESIGN_TYPES.find(t => t.id === id) || STATION_DESIGN_TYPES[0]; }

// Bigger designed stations draw riders from further away - a real reason
// (beyond cosmetics) to build up past the "small" tier.
export const STATION_TIER_CATCHMENT_MULT = { small: 1, medium: 1.3, large: 1.7, mega: 2.2 };

export function stationDesignCost(design) {
  const type = stationDesignType(design.typeId);
  return Math.round(design.w * design.d * type.costPerCell);
}

// Cost to upgrade to the next tier, charged only on the NEW footprint area
// gained (existing footprint is already paid for) - mirrors the standalone
// station-builder tool's upgrades.js formula.
export function stationTierUpgradePlan(design) {
  const next = nextStationTier(design.tierId);
  if (!next) return null;
  const type = stationDesignType(design.typeId);
  const oldArea = design.w * design.d;
  const newArea = next.w * next.d;
  const cost = Math.round(Math.max(0, newArea - oldArea) * type.costPerCell * STATION_TIER_UPGRADE_COST_MULT);
  return { next, cost };
}

// category: 'platform' | 'circulation' | 'amenity' | 'entrance'
export const STATION_INTERIOR_OBJECTS = [
  { id: 'empty', name: 'Erase', icon: '⬛', category: 'empty', color: '#2b2f38', cost: 0, walkable: true },
  { id: 'platform', name: 'Platform Edge', icon: '🟧', category: 'platform', color: '#d98a3d', cost: 400, walkable: true },
  { id: 'waiting_area', name: 'Waiting Area', icon: '🟩', category: 'amenity', color: '#6fae6f', cost: 150, walkable: true },
  { id: 'bench', name: 'Bench / Seating', icon: '🪑', category: 'amenity', color: '#a97c50', cost: 300, walkable: false },
  { id: 'ticket_machine', name: 'Ticket Machine', icon: '🎫', category: 'amenity', color: '#5b8ac9', cost: 2500, walkable: false },
  { id: 'turnstile', name: 'Turnstile / Gate', icon: '🚧', category: 'circulation', color: '#c9a63d', cost: 1800, walkable: true },
  { id: 'info_board', name: 'Information Board', icon: 'ℹ️', category: 'amenity', color: '#4a6fa5', cost: 600, walkable: false },
  // Shops: real passive-income objects, not just decoration - see
  // stationStatEngine.js's computeStationShopRevenue(), which sums
  // revenuePerDay across every shop cell and scales it by how busy the
  // station actually is (an empty shop earns little; a packed one earns
  // its full rate). revenuePerDay is a *base* rate at "on target" footfall.
  { id: 'kiosk', name: 'Kiosk', icon: '🏪', category: 'shop', color: '#c15fa0', cost: 8000, walkable: false, revenuePerDay: 90 },
  { id: 'cafe', name: 'Café', icon: '☕', category: 'shop', color: '#a9714a', cost: 14000, walkable: false, revenuePerDay: 150 },
  { id: 'newsstand', name: 'Newsstand', icon: '📰', category: 'shop', color: '#c9a63d', cost: 4000, walkable: false, revenuePerDay: 70 },
  { id: 'pharmacy', name: 'Pharmacy', icon: '💊', category: 'shop', color: '#5fae8f', cost: 16000, walkable: false, revenuePerDay: 110 },
  { id: 'tech_store', name: 'Tech Store', icon: '📱', category: 'shop', color: '#4a6fa5', cost: 22000, walkable: false, revenuePerDay: 200 },
  { id: 'bookstore', name: 'Bookstore', icon: '📚', category: 'shop', color: '#8a5fae', cost: 12000, walkable: false, revenuePerDay: 90 },
  { id: 'restroom', name: 'Restroom', icon: '🚻', category: 'amenity', color: '#5fb0b0', cost: 12000, walkable: false },
  { id: 'entrance', name: 'Entrance / Exit', icon: '🚪', category: 'entrance', color: '#e8e8e8', cost: 1000, walkable: true },
  { id: 'stairs', name: 'Stairs', icon: '🪜', category: 'circulation', color: '#8f8f8f', cost: 4000, walkable: true },
  { id: 'escalator', name: 'Escalator', icon: '🔼', category: 'circulation', color: '#4fae8f', cost: 15000, walkable: true },
  { id: 'elevator', name: 'Elevator (accessible)', icon: '🛗', category: 'circulation', color: '#4f8fae', cost: 25000, walkable: true, accessible: true },
];

export function stationInteriorObject(id) { return STATION_INTERIOR_OBJECTS.find(o => o.id === id); }

export const STATION_MIN_ENTRANCES = { small: 1, medium: 2, large: 3, mega: 4 };
export const STATION_TARGET_THROUGHPUT = { small: 300, medium: 1200, large: 4000, mega: 9000 };
export const STATION_REQUIRED_PLATFORM_LENGTH_M = { bus_stop: 14, tram_stop: 32, subway: 120 };

export const STATION_LEVEL_COST_PER_CELL = 500;
export const STATION_TIER_UPGRADE_COST_MULT = 1.15;

export const STATION_ARCHITECTURE_STYLES = [
  {
    id: 'modern', name: 'Modern Glass-Steel', icon: '🏙️',
    wall: 0x8fa3ad, trim: 0x2c3e46, roof: 0x3b4a52, accent: 0x4fa0d9,
  },
  {
    id: 'heritage', name: 'Heritage Brick', icon: '🧱',
    wall: 0x8a4a35, trim: 0x3a2a20, roof: 0x4a3226, accent: 0xcfa646,
  },
  {
    id: 'minimal', name: 'Minimal Concrete', icon: '⬜',
    wall: 0xb7b4ac, trim: 0x8a877e, roof: 0x6e6b64, accent: 0xd8663d,
  },
  {
    // Curved glass-canopy vault with branching green ribs and a
    // sky-mural ceiling, in the spirit of a bright futuristic transit hub -
    // gets its own shell shape (see stationMeshBuilder.js/stationWalk.js)
    // rather than the flat box+roof the other styles share.
    id: 'futuristic', name: 'Futuristic Canopy', icon: '🌿',
    wall: 0xf2f4f0, trim: 0x2f7a45, roof: 0xbfe6f2, accent: 0x3ee06a,
  },
];

export function stationArchitectureStyle(id) {
  return STATION_ARCHITECTURE_STYLES.find(s => s.id === id) || STATION_ARCHITECTURE_STYLES[0];
}
