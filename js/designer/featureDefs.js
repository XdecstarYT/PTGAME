// Optional onboard amenities a design can include. Each toggle folds a flat
// per-car purchase cost and running cost into computeStats() (vehicleModel.js)
// plus a comfort/reliability bonus - real functional trade-offs, not just
// cosmetic checkboxes. A couple of them also add roof/door detail in
// vehicleMeshBuilder.js so the choice is visible on the model, not just in
// the stats panel.

export const FEATURE_DEFS = [
  { id: 'aircon', label: 'Air Conditioning', icon: '❄️', costPerCar: 6000, runningCostPerDayPerCar: 25, comfortBonus: 8, reliabilityBonus: -1 },
  { id: 'wifi', label: 'Free WiFi', icon: '📶', costPerCar: 2500, runningCostPerDayPerCar: 8, comfortBonus: 5, reliabilityBonus: 0 },
  { id: 'usbCharging', label: 'USB Charging Points', icon: '🔌', costPerCar: 1200, runningCostPerDayPerCar: 3, comfortBonus: 3, reliabilityBonus: 0 },
  { id: 'cctv', label: 'CCTV Security', icon: '📹', costPerCar: 3000, runningCostPerDayPerCar: 5, comfortBonus: 2, reliabilityBonus: 1 },
  { id: 'luggageRack', label: 'Luggage Racks', icon: '🧳', costPerCar: 1800, runningCostPerDayPerCar: 2, comfortBonus: 3, reliabilityBonus: 0 },
];

export function featureById(id) { return FEATURE_DEFS.find(f => f.id === id); }

export function defaultFeatures() {
  const f = {};
  for (const def of FEATURE_DEFS) f[def.id] = false;
  f.prioritySeats = 0;
  return f;
}

// Priority seating: a count of seats designated for elderly/disabled/
// pregnant riders. Small comfort bonus, no extra cost - it's a designation
// on existing seats, not new equipment - capped so it can't exceed a
// design's actual seat count (enforced by the caller, which knows seatCount).
export const MAX_PRIORITY_SEATS = 6;
export const PRIORITY_SEAT_COMFORT_BONUS_EACH = 1.2;
