// Chassis = the physical shell the player designs a vehicle on top of.
// category drives road/track/tunnel behavior (unchanged from the old fixed
// VEHICLE_TYPES); everything else here is just starting numbers the player's
// powertrain/interior/livery/consist choices then modify.

export const CHASSIS_DEFS = [
  {
    id: 'bus_mini', category: 'bus', manufacturer: 'Roadster', name: 'Roadster Mini',
    lengthUnits: 5, gridRows: 2, gridCols: 5, doorZones: [0],
    minLengthUnits: 4, maxLengthUnits: 7, minGridRows: 2, maxGridRows: 3,
    baseCostPerCar: 26000, baseSpeed: 40, baseRunningCostPerCar: 340,
    minConsist: 1, maxConsist: 1,
    defaultAisleWidthCm: 55, minAisleWidthCm: 40, maxAisleWidthCm: 80,
    defaultStepHeightCm: 32, minStepHeightCm: 10, maxStepHeightCm: 42,
  },
  {
    id: 'bus_standard', category: 'bus', manufacturer: 'Roadster', name: 'Roadster Standard',
    lengthUnits: 8, gridRows: 3, gridCols: 8, doorZones: [0, 5],
    minLengthUnits: 6, maxLengthUnits: 10, minGridRows: 2, maxGridRows: 4,
    baseCostPerCar: 45000, baseSpeed: 42, baseRunningCostPerCar: 550,
    minConsist: 1, maxConsist: 1,
    defaultAisleWidthCm: 65, minAisleWidthCm: 45, maxAisleWidthCm: 100,
    defaultStepHeightCm: 30, minStepHeightCm: 5, maxStepHeightCm: 40,
  },
  {
    id: 'bus_articulated', category: 'bus', manufacturer: 'Roadster', name: 'Roadster Articulated',
    lengthUnits: 12, gridRows: 3, gridCols: 12, doorZones: [0, 5, 10],
    minLengthUnits: 10, maxLengthUnits: 16, minGridRows: 3, maxGridRows: 4,
    baseCostPerCar: 70000, baseSpeed: 39, baseRunningCostPerCar: 780,
    minConsist: 1, maxConsist: 1,
    defaultAisleWidthCm: 70, minAisleWidthCm: 45, maxAisleWidthCm: 100,
    defaultStepHeightCm: 28, minStepHeightCm: 5, maxStepHeightCm: 40,
  },
  {
    id: 'tram_heritage', category: 'tram', manufacturer: 'Continental', name: 'Continental Heritage',
    lengthUnits: 8, gridRows: 3, gridCols: 8, doorZones: [0, 6],
    minLengthUnits: 6, maxLengthUnits: 10, minGridRows: 2, maxGridRows: 4,
    baseCostPerCar: 68000, baseSpeed: 48, baseRunningCostPerCar: 900,
    minConsist: 1, maxConsist: 1,
    defaultAisleWidthCm: 60, minAisleWidthCm: 45, maxAisleWidthCm: 90,
    defaultStepHeightCm: 24, minStepHeightCm: 5, maxStepHeightCm: 35,
  },
  {
    id: 'tram_t1', category: 'tram', manufacturer: 'Continental', name: 'Continental T1',
    lengthUnits: 10, gridRows: 4, gridCols: 10, doorZones: [0, 4, 9],
    minLengthUnits: 8, maxLengthUnits: 13, minGridRows: 3, maxGridRows: 5,
    baseCostPerCar: 95000, baseSpeed: 70, baseRunningCostPerCar: 1100,
    minConsist: 1, maxConsist: 3,
    defaultAisleWidthCm: 75, minAisleWidthCm: 50, maxAisleWidthCm: 110,
    defaultStepHeightCm: 18, minStepHeightCm: 0, maxStepHeightCm: 35,
  },
  {
    id: 'tram_t1_long', category: 'tram', manufacturer: 'Continental', name: 'Continental T1 Long',
    lengthUnits: 14, gridRows: 4, gridCols: 14, doorZones: [0, 4, 9, 13],
    minLengthUnits: 12, maxLengthUnits: 18, minGridRows: 3, maxGridRows: 5,
    baseCostPerCar: 125000, baseSpeed: 67, baseRunningCostPerCar: 1400,
    minConsist: 1, maxConsist: 3,
    defaultAisleWidthCm: 78, minAisleWidthCm: 50, maxAisleWidthCm: 110,
    defaultStepHeightCm: 16, minStepHeightCm: 0, maxStepHeightCm: 35,
  },
  {
    id: 'metro_m2_light', category: 'subway', manufacturer: 'Metro', name: 'Metro M2 Light Rail',
    lengthUnits: 11, gridRows: 4, gridCols: 11, doorZones: [0, 5, 10],
    minLengthUnits: 9, maxLengthUnits: 14, minGridRows: 3, maxGridRows: 5,
    baseCostPerCar: 150000, baseSpeed: 105, baseRunningCostPerCar: 1600,
    minConsist: 1, maxConsist: 4,
    defaultAisleWidthCm: 82, minAisleWidthCm: 55, maxAisleWidthCm: 115,
    defaultStepHeightCm: 10, minStepHeightCm: 0, maxStepHeightCm: 30,
  },
  {
    id: 'metro_m4', category: 'subway', manufacturer: 'Metro', name: 'Metro M4',
    lengthUnits: 14, gridRows: 5, gridCols: 14, doorZones: [0, 3, 6, 9, 13],
    minLengthUnits: 12, maxLengthUnits: 18, minGridRows: 4, maxGridRows: 6,
    baseCostPerCar: 210000, baseSpeed: 128, baseRunningCostPerCar: 2200,
    minConsist: 1, maxConsist: 8,
    defaultAisleWidthCm: 90, minAisleWidthCm: 60, maxAisleWidthCm: 120,
    defaultStepHeightCm: 8, minStepHeightCm: 0, maxStepHeightCm: 25,
  },
  {
    id: 'metro_m6', category: 'subway', manufacturer: 'Metro', name: 'Metro M6 Express',
    lengthUnits: 16, gridRows: 5, gridCols: 16, doorZones: [0, 3, 6, 9, 12, 15],
    minLengthUnits: 14, maxLengthUnits: 20, minGridRows: 4, maxGridRows: 6,
    baseCostPerCar: 250000, baseSpeed: 142, baseRunningCostPerCar: 2600,
    minConsist: 1, maxConsist: 8,
    defaultAisleWidthCm: 92, minAisleWidthCm: 60, maxAisleWidthCm: 120,
    defaultStepHeightCm: 8, minStepHeightCm: 0, maxStepHeightCm: 25,
  },
];

export function chassisById(id) { return CHASSIS_DEFS.find(c => c.id === id); }
export function chassisForCategory(category) { return CHASSIS_DEFS.filter(c => c.category === category); }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Spreads doorCount door zones as evenly as possible across [0, cols).
function evenDoorZones(cols, doorCount) {
  const n = Math.max(1, Math.min(doorCount, cols));
  const zones = [];
  for (let i = 0; i < n; i++) zones.push(clamp(Math.round((i + 0.5) * (cols / n)), 0, cols - 1));
  return [...new Set(zones)];
}

export function maxDoorCountFor(lengthUnits) { return Math.max(1, Math.floor(lengthUnits / 3)); }

// A player-customized chassis: same category/manufacturer/consist rules as
// its base preset (picking a preset is really "picking a starting family"),
// but length/width/door-count can be slid within that preset's bounds. Cost
// and running cost scale with the resulting footprint instead of staying
// pinned to the preset's numbers, and top speed drops a little as length
// grows past the base, so "make it bigger" is a real tradeoff rather than a
// free upgrade. Every other field (consist limits, aisle/step bounds, etc.)
// passes through from the base preset unchanged.
export function effectiveChassis(model) {
  const base = chassisById(model.chassisId);
  const lengthUnits = clamp(model.customLengthUnits ?? base.lengthUnits, base.minLengthUnits, base.maxLengthUnits);
  const gridRows = clamp(model.customGridRows ?? base.gridRows, base.minGridRows, base.maxGridRows);
  const doorCount = clamp(model.customDoorCount ?? base.doorZones.length, 1, maxDoorCountFor(lengthUnits));
  const gridCols = lengthUnits;
  const doorZones = evenDoorZones(gridCols, doorCount);

  const sizeMult = (lengthUnits * gridRows) / (base.lengthUnits * base.gridRows);
  const speedMult = 1 - Math.max(0, lengthUnits - base.lengthUnits) * 0.01;

  return {
    ...base,
    lengthUnits, gridRows, gridCols, doorZones,
    baseCostPerCar: Math.round(base.baseCostPerCar * sizeMult),
    baseRunningCostPerCar: Math.round(base.baseRunningCostPerCar * sizeMult),
    baseSpeed: Math.round(base.baseSpeed * speedMult * 10) / 10,
  };
}
