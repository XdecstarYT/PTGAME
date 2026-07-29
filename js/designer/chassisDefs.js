// Chassis = the physical shell the player designs a vehicle on top of.
// category drives road/track/tunnel behavior (unchanged from the old fixed
// VEHICLE_TYPES); everything else here is just starting numbers the player's
// powertrain/interior/livery/consist choices then modify.

export const CHASSIS_DEFS = [
  {
    id: 'bus_standard', category: 'bus', manufacturer: 'Roadster', name: 'Roadster Standard',
    lengthUnits: 8, gridRows: 3, gridCols: 8, doorZones: [0, 5],
    baseCostPerCar: 45000, baseSpeed: 42, baseRunningCostPerCar: 550,
    minConsist: 1, maxConsist: 1,
    defaultAisleWidthCm: 65, minAisleWidthCm: 45, maxAisleWidthCm: 100,
    defaultStepHeightCm: 30, minStepHeightCm: 5, maxStepHeightCm: 40,
  },
  {
    id: 'bus_articulated', category: 'bus', manufacturer: 'Roadster', name: 'Roadster Articulated',
    lengthUnits: 12, gridRows: 3, gridCols: 12, doorZones: [0, 5, 10],
    baseCostPerCar: 70000, baseSpeed: 39, baseRunningCostPerCar: 780,
    minConsist: 1, maxConsist: 1,
    defaultAisleWidthCm: 70, minAisleWidthCm: 45, maxAisleWidthCm: 100,
    defaultStepHeightCm: 28, minStepHeightCm: 5, maxStepHeightCm: 40,
  },
  {
    id: 'tram_t1', category: 'tram', manufacturer: 'Continental', name: 'Continental T1',
    lengthUnits: 10, gridRows: 4, gridCols: 10, doorZones: [0, 4, 9],
    baseCostPerCar: 95000, baseSpeed: 70, baseRunningCostPerCar: 1100,
    minConsist: 1, maxConsist: 3,
    defaultAisleWidthCm: 75, minAisleWidthCm: 50, maxAisleWidthCm: 110,
    defaultStepHeightCm: 18, minStepHeightCm: 0, maxStepHeightCm: 35,
  },
  {
    id: 'tram_t1_long', category: 'tram', manufacturer: 'Continental', name: 'Continental T1 Long',
    lengthUnits: 14, gridRows: 4, gridCols: 14, doorZones: [0, 4, 9, 13],
    baseCostPerCar: 125000, baseSpeed: 67, baseRunningCostPerCar: 1400,
    minConsist: 1, maxConsist: 3,
    defaultAisleWidthCm: 78, minAisleWidthCm: 50, maxAisleWidthCm: 110,
    defaultStepHeightCm: 16, minStepHeightCm: 0, maxStepHeightCm: 35,
  },
  {
    id: 'metro_m4', category: 'subway', manufacturer: 'Metro', name: 'Metro M4',
    lengthUnits: 14, gridRows: 5, gridCols: 14, doorZones: [0, 3, 6, 9, 13],
    baseCostPerCar: 210000, baseSpeed: 128, baseRunningCostPerCar: 2200,
    minConsist: 1, maxConsist: 8,
    defaultAisleWidthCm: 90, minAisleWidthCm: 60, maxAisleWidthCm: 120,
    defaultStepHeightCm: 8, minStepHeightCm: 0, maxStepHeightCm: 25,
  },
  {
    id: 'metro_m6', category: 'subway', manufacturer: 'Metro', name: 'Metro M6 Express',
    lengthUnits: 16, gridRows: 5, gridCols: 16, doorZones: [0, 3, 6, 9, 12, 15],
    baseCostPerCar: 250000, baseSpeed: 142, baseRunningCostPerCar: 2600,
    minConsist: 1, maxConsist: 8,
    defaultAisleWidthCm: 92, minAisleWidthCm: 60, maxAisleWidthCm: 120,
    defaultStepHeightCm: 8, minStepHeightCm: 0, maxStepHeightCm: 25,
  },
];

export function chassisById(id) { return CHASSIS_DEFS.find(c => c.id === id); }
export function chassisForCategory(category) { return CHASSIS_DEFS.filter(c => c.category === category); }
