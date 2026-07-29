// Shared constants for the whole game. Kept in one place so every module agrees
// on grid geometry, economy numbers, and simulation pacing.

export const GRID_SIZE = 28;          // tiles per side
export const TILE_SIZE = 12;          // world units per tile
export const ROAD_SPACING = 4;        // every Nth grid line is a road
export const BLOCK_SIZE = ROAD_SPACING - 1; // buildable tiles between roads

export const WORLD_SIZE = GRID_SIZE * TILE_SIZE;

export const ZONE = {
  EMPTY: 'empty',
  RESIDENTIAL: 'residential',
  COMMERCIAL: 'commercial',
  INDUSTRIAL: 'industrial',
  ROAD: 'road',
  BRIDGE: 'bridge',
  WATER: 'water',
  LANDMARK: 'landmark',
  PARK: 'park',
};

export const ZONE_COLORS = {
  residential: 0x8fbf7a,
  commercial: 0x6fa8dc,
  industrial: 0xd9a066,
  road: 0x4a4750,
  bridge: 0x716a5e,
  water: 0x3b6ea5,
  landmark: 0xd97ea0,
  park: 0x6fbf8c,
  empty: 0x39433a,
  locked: 0x2a2f2a,
};

// Category-level metadata only - per-vehicle numbers (speed/capacity/cost/etc)
// now come from whatever VehicleModel (see js/designer/) a route is assigned.
// `unlocked` gates which chassis categories the Vehicle Designer offers and
// is flipped by milestones in main.js exactly as before.
export const VEHICLE_TYPES = {
  bus: {
    id: 'bus',
    label: 'Bus',
    needsTrack: false,
    needsTunnel: false,
    unlocked: true,
  },
  tram: {
    id: 'tram',
    label: 'Tram',
    needsTrack: true,
    trackCostPerTile: 20000,
    needsTunnel: false,
    unlocked: false,
    unlockKey: 'tram',
  },
  subway: {
    id: 'subway',
    label: 'Subway',
    needsTrack: false,
    needsTunnel: true,
    tunnelCostPerUnit: 500,
    unlocked: false,
    unlockKey: 'subway',
  },
};

// Fallback speed used only before a route has a vehicle model assigned.
export const FALLBACK_VEHICLE_SPEED = 40;
export const DEFAULT_REGULATION_ID = 'minimal';
export const KM_PER_WORLD_UNIT = 0.05; // for the odometer shown in the Fleet panel

export const STATION_COST = 80000;
export const STATION_MAINTENANCE_PER_DAY = 120;
export const STATION_CATCHMENT_RADIUS = TILE_SIZE * 2.1;

export const WALK_SPEED = 14;         // world units per sim-minute
export const BASE_FARE = 3.0;         // $ per completed trip

export const STARTING_BUDGET = 750000;

// Sim-minutes advanced per real second at 1x speed.
export const SIM_MINUTES_PER_REAL_SECOND = 8;
export const SIM_TICK_MS = 100; // fixed timestep for simulation logic

export const ROUTE_PALETTE = [
  0xff6b6b, 0xffb14e, 0xffd166, 0x6ee7c9, 0x6fa8dc,
  0xa78bfa, 0xf472b6, 0x60d394, 0xf9844a, 0x4ea8de,
  0xe0aaff, 0x90be6d,
];

export const MAX_ACCEPTABLE_TRIP_MINUTES = 75;
export const MAX_TRANSFERS = 3;

export const SUBSIDY_PER_RIDER = 0.5; // flat government top-up per completed trip, on top of fare
export const COMBUSTION_POWERTRAINS = ['diesel', 'hybrid', 'hydrogen']; // affected by fuel price shocks
