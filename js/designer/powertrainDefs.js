// Powertrain modifies a chassis's base cost/speed/running-cost/emissions.
// categories[] lists which chassis categories may use it.

export const POWERTRAIN_DEFS = [
  {
    id: 'diesel', label: 'Diesel', categories: ['bus', 'truck', 'freight_rail'],
    costMult: 1.0, speedMult: 1.0, runningCostMult: 1.15, emissions: 1.0, reliabilityMod: 0,
  },
  {
    id: 'cng', label: 'CNG (Natural Gas)', categories: ['bus', 'truck'],
    costMult: 1.08, speedMult: 0.98, runningCostMult: 0.85, emissions: 0.6, reliabilityMod: -1,
  },
  {
    id: 'hybrid', label: 'Hybrid', categories: ['bus', 'tram', 'truck'],
    costMult: 1.15, speedMult: 1.0, runningCostMult: 0.9, emissions: 0.45, reliabilityMod: -3,
  },
  {
    id: 'electric', label: 'Electric', categories: ['bus', 'tram', 'subway', 'truck', 'freight_rail'],
    costMult: 1.3, speedMult: 1.05, runningCostMult: 0.7, emissions: 0.05, reliabilityMod: 2,
  },
  {
    id: 'hydrogen', label: 'Hydrogen Fuel Cell', categories: ['bus', 'truck'],
    costMult: 1.5, speedMult: 1.0, runningCostMult: 0.8, emissions: 0.1, reliabilityMod: -5,
  },
  {
    id: 'third_rail', label: 'Third-Rail Electric', categories: ['subway'],
    costMult: 1.2, speedMult: 1.1, runningCostMult: 0.65, emissions: 0.05, reliabilityMod: 3,
  },
];

export function powertrainById(id) { return POWERTRAIN_DEFS.find(p => p.id === id); }
export function powertrainsForCategory(category) { return POWERTRAIN_DEFS.filter(p => p.categories.includes(category)); }
