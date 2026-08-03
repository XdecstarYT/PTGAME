import { chassisById, effectiveChassis } from './chassisDefs.js';
import { powertrainById, powertrainsForCategory } from './powertrainDefs.js';
import { checkCompliance, regulationById } from './regulations.js';
import { FEATURE_DEFS, defaultFeatures, MAX_PRIORITY_SEATS, PRIORITY_SEAT_COMFORT_BONUS_EACH } from './featureDefs.js';

// A VehicleModel is a plain, JSON-serializable data object (so it can be
// saved to localStorage / exported as-is) - all derived numbers are computed
// on demand by computeStats() rather than stored on the model itself.

export function createDefaultFloorPlan(chassis) {
  const rows = chassis.gridRows, cols = chassis.gridCols;
  const aisleRow = Math.floor(rows / 2);
  const plan = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push(r === aisleRow || chassis.doorZones.includes(c) ? 'aisle' : 'seat');
    }
    plan.push(row);
  }
  return plan;
}

export function createDefaultModel(chassisId) {
  const chassis = chassisById(chassisId);
  const powertrain = powertrainsForCategory(chassis.category)[0];
  return {
    id: null,
    name: `${chassis.name} Design`,
    chassisId,
    powertrainId: powertrain.id,
    consistCars: 1,
    customLengthUnits: chassis.lengthUnits,
    customGridRows: chassis.gridRows,
    customDoorCount: chassis.doorZones.length,
    aisleWidthCm: chassis.defaultAisleWidthCm,
    stepHeightCm: chassis.defaultStepHeightCm,
    doorZonesActive: chassis.doorZones.map(() => true),
    floorPlan: createDefaultFloorPlan(chassis),
    deckCount: 1,
    upperFloorPlan: null,
    livery: {
      primary: '#3a6ea5', secondary: '#f4f0ff', pattern: 'stripe', operatorName: '',
      roof: '#2a2d33', skirt: '#1c1e22', logoDataUrl: null,
    },
    features: defaultFeatures(),
    thumbnail: null,
    createdAt: Date.now(),
  };
}

function countCells(floorPlan, type) {
  let n = 0;
  for (const row of floorPlan) for (const cell of row) if (cell === type) n++;
  return n;
}

// Flood fill from the front column to the back column through any non-seat
// cell, so a design without a clear boarding-to-back path gets flagged.
export function checkAisleConnectivity(floorPlan) {
  const rows = floorPlan.length, cols = floorPlan[0]?.length || 0;
  if (!rows || !cols) return true;
  const visited = Array.from({ length: rows }, () => new Array(cols).fill(false));
  const stack = [];
  for (let r = 0; r < rows; r++) {
    if (floorPlan[r][0] !== 'seat') { stack.push([r, 0]); visited[r][0] = true; }
  }
  while (stack.length) {
    const [r, c] = stack.pop();
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !visited[nr][nc] && floorPlan[nr][nc] !== 'seat') {
        visited[nr][nc] = true;
        stack.push([nr, nc]);
      }
    }
  }
  for (let r = 0; r < rows; r++) if (visited[r][cols - 1]) return true;
  return false;
}

// opts: { activeRegulationId, fareAssumption, ridershipAssumption }
export function computeStats(model, opts = {}) {
  const chassis = effectiveChassis(model);
  const powertrain = powertrainById(model.powertrainId);

  const isDoubleDecker = model.deckCount === 2 && !!model.upperFloorPlan;
  const decks = isDoubleDecker ? [model.floorPlan, model.upperFloorPlan] : [model.floorPlan];
  const sumDecks = (type) => decks.reduce((sum, plan) => sum + countCells(plan, type), 0);

  const seatCount = sumDecks('seat');
  const standingCells = sumDecks('standing');
  const wheelchairCells = sumDecks('wheelchair');
  const luggageCells = sumDecks('luggage');

  const capacitySeatedPerCar = seatCount;
  const capacityStandingPerCar = standingCells * 1.5 + wheelchairCells;
  const capacityTotalPerCar = Math.round(capacitySeatedPerCar + capacityStandingPerCar);
  const capacityTotal = capacityTotalPerCar * model.consistCars;

  const doorCount = model.doorZonesActive.filter(Boolean).length;
  const accessibleBays = wheelchairCells;

  // A second deck only needs its own seats/standing/wheelchair fitout - the
  // stairs/deck structure premium is folded into the chassis cost below.
  const interiorFitoutPerCar = seatCount * 150 + standingCells * 60 + wheelchairCells * 500 + luggageCells * 80;
  const deckCostMult = isDoubleDecker ? 1.6 : 1;

  const features = model.features || {};
  const activeFeatures = FEATURE_DEFS.filter(f => features[f.id]);
  const featureCostPerCar = activeFeatures.reduce((sum, f) => sum + f.costPerCar, 0);
  const featureRunningCostPerCar = activeFeatures.reduce((sum, f) => sum + f.runningCostPerDayPerCar, 0);
  const featureComfortBonus = activeFeatures.reduce((sum, f) => sum + f.comfortBonus, 0);
  const featureReliabilityBonus = activeFeatures.reduce((sum, f) => sum + f.reliabilityBonus, 0);
  const prioritySeats = Math.min(MAX_PRIORITY_SEATS, seatCount, features.prioritySeats || 0);
  const priorityComfortBonus = prioritySeats * PRIORITY_SEAT_COMFORT_BONUS_EACH;

  const purchaseCost = Math.round((chassis.baseCostPerCar * powertrain.costMult * deckCostMult + interiorFitoutPerCar + featureCostPerCar) * model.consistCars + 2000);
  const runningCostPerDay = Math.round((chassis.baseRunningCostPerCar * powertrain.runningCostMult * deckCostMult + featureRunningCostPerCar) * model.consistCars);

  const consistSpeedPenalty = 1 - Math.min(0.25, 0.015 * (model.consistCars - 1));
  const deckSpeedPenalty = isDoubleDecker ? 0.94 : 1;
  const topSpeed = Math.round(chassis.baseSpeed * powertrain.speedMult * consistSpeedPenalty * deckSpeedPenalty * 10) / 10;

  const standingRatio = capacityTotalPerCar > 0 ? capacityStandingPerCar / capacityTotalPerCar : 0;
  const aisleSpan = Math.max(1, chassis.maxAisleWidthCm - chassis.minAisleWidthCm);
  const aisleBonus = (model.aisleWidthCm - chassis.minAisleWidthCm) / aisleSpan;
  const luggageBonus = Math.min(6, luggageCells * 1.2);
  const comfortScore = Math.round(Math.max(0, Math.min(100,
    78 - standingRatio * 35 + aisleBonus * 20 + featureComfortBonus + priorityComfortBonus + luggageBonus)));

  const boardingSpeedScore = Math.round(Math.max(0, Math.min(100, 40 + doorCount * 13)));
  const reliabilityBase = Math.round(Math.max(10, Math.min(100, 92 + powertrain.reliabilityMod + featureReliabilityBonus)));
  const emissionsScore = Math.round(powertrain.emissions * model.consistCars * 10) / 10;

  // an ad wrap sells the exterior as ad space instead of just a paint job
  const adRevenuePerDay = model.livery.pattern === 'adwrap' ? Math.round(capacityTotalPerCar * model.consistCars * 0.8) : 0;

  const ruleset = regulationById(opts.activeRegulationId);
  const compliance = checkCompliance(
    { doorCount, accessibleBays, aisleWidthCm: model.aisleWidthCm, stepHeightCm: model.stepHeightCm },
    ruleset
  );
  const connected = decks.every(plan => checkAisleConnectivity(plan));
  const stairsConnected = !isDoubleDecker || decks.every(plan => countCells(plan, 'stairs') >= 1);

  const assumedRidership = opts.ridershipAssumption ?? Math.max(1, Math.round(capacityTotal * 3.5));
  const assumedFare = opts.fareAssumption ?? 3;
  const dailyNet = assumedRidership * assumedFare - runningCostPerDay;
  const paybackDays = dailyNet > 0 ? Math.round(purchaseCost / dailyNet) : null;
  const runningCostPerPassenger = Math.round((runningCostPerDay / Math.max(1, assumedRidership)) * 100) / 100;

  return {
    category: chassis.category, chassisName: chassis.name, manufacturer: chassis.manufacturer,
    powertrainLabel: powertrain.label,
    capacitySeatedPerCar, capacityStandingPerCar: Math.round(capacityStandingPerCar),
    capacityTotalPerCar, capacityTotal,
    doorCount, accessibleBays,
    purchaseCost, runningCostPerDay, topSpeed, adRevenuePerDay,
    comfortScore, boardingSpeedScore, reliabilityBase, emissionsScore,
    compliance, connected, ruleset,
    paybackDays, runningCostPerPassenger,
    assumedRidership, assumedFare,
    activeFeatures, featureCostPerCar, featureRunningCostPerCar, prioritySeats,
    isDoubleDecker, stairsConnected, luggageCells,
  };
}
