// Freight chassis - parallel to chassisDefs.js but for cargo vehicles. No
// seating/aisle/door-zone fields since there's no passenger floor plan;
// instead a single cargoCapacityTons number and a bodyStyle that drives
// which cargo types it can carry (see config.js's CARGO_TYPES) and which
// exterior mesh freightMeshBuilder.js builds.

export const FREIGHT_CHASSIS_DEFS = [
  {
    id: 'truck_box', category: 'truck', manufacturer: 'Roadster', name: 'Roadster Box Truck',
    bodyStyle: 'box', lengthUnits: 7, cargoCapacityTons: 8,
    baseCostPerCar: 38000, baseSpeed: 44, baseRunningCostPerCar: 420,
    minConsist: 1, maxConsist: 1,
    compatibleCargo: ['manufactured_goods', 'retail_stock'],
  },
  {
    id: 'truck_flatbed', category: 'truck', manufacturer: 'Roadster', name: 'Roadster Flatbed',
    bodyStyle: 'flatbed', lengthUnits: 8, cargoCapacityTons: 12,
    baseCostPerCar: 42000, baseSpeed: 42, baseRunningCostPerCar: 470,
    minConsist: 1, maxConsist: 1,
    compatibleCargo: ['raw_materials'],
  },
  {
    id: 'truck_tanker', category: 'truck', manufacturer: 'Roadster', name: 'Roadster Reefer Tanker',
    bodyStyle: 'tanker', lengthUnits: 8, cargoCapacityTons: 10,
    baseCostPerCar: 52000, baseSpeed: 40, baseRunningCostPerCar: 560,
    minConsist: 1, maxConsist: 1,
    compatibleCargo: ['perishables'],
  },
  {
    id: 'freight_hopper', category: 'freight_rail', manufacturer: 'Metro', name: 'Metro Freight Hopper Set',
    bodyStyle: 'hopper', lengthUnits: 12, cargoCapacityTons: 60,
    baseCostPerCar: 180000, baseSpeed: 90, baseRunningCostPerCar: 1800,
    minConsist: 1, maxConsist: 6,
    compatibleCargo: ['raw_materials'],
  },
  {
    id: 'freight_boxcar', category: 'freight_rail', manufacturer: 'Metro', name: 'Metro Freight Boxcar Set',
    bodyStyle: 'boxcar', lengthUnits: 12, cargoCapacityTons: 45,
    baseCostPerCar: 165000, baseSpeed: 95, baseRunningCostPerCar: 1650,
    minConsist: 1, maxConsist: 6,
    compatibleCargo: ['manufactured_goods', 'retail_stock'],
  },
];

export function freightChassisById(id) { return FREIGHT_CHASSIS_DEFS.find(c => c.id === id); }
export function freightChassisForCategory(category) { return FREIGHT_CHASSIS_DEFS.filter(c => c.category === category); }
export function freightChassisForCargo(cargoTypeId) { return FREIGHT_CHASSIS_DEFS.filter(c => c.compatibleCargo.includes(cargoTypeId)); }
