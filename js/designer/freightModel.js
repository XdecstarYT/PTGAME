import { freightChassisById } from './freightChassisDefs.js';
import { powertrainById, powertrainsForCategory } from './powertrainDefs.js';

// A FreightModel is the cargo-vehicle equivalent of vehicleModel.js's
// VehicleModel - plain, JSON-serializable, all derived numbers computed on
// demand. No floor plan / aisle / step / doors - freight has no passengers,
// just a cargo bay whose capacity comes straight from the chassis.

export function createDefaultFreightModel(chassisId) {
  const chassis = freightChassisById(chassisId);
  const powertrain = powertrainsForCategory(chassis.category)[0];
  return {
    id: null,
    kind: 'freight',
    name: `${chassis.name} Design`,
    chassisId,
    powertrainId: powertrain.id,
    consistCars: 1,
    livery: { primary: '#5a6b52', secondary: '#e8dfc8', pattern: 'solid', operatorName: '', logoDataUrl: null },
    thumbnail: null,
    createdAt: Date.now(),
  };
}

export function computeFreightStats(model, opts = {}) {
  const chassis = freightChassisById(model.chassisId);
  const powertrain = powertrainById(model.powertrainId);

  const capacityTonsPerCar = chassis.cargoCapacityTons;
  const capacityTonsTotal = Math.round(capacityTonsPerCar * model.consistCars * 10) / 10;

  const purchaseCost = Math.round(chassis.baseCostPerCar * powertrain.costMult * model.consistCars + 1500);
  const runningCostPerDay = Math.round(chassis.baseRunningCostPerCar * powertrain.runningCostMult * model.consistCars);

  const consistSpeedPenalty = 1 - Math.min(0.2, 0.01 * (model.consistCars - 1));
  const topSpeed = Math.round(chassis.baseSpeed * powertrain.speedMult * consistSpeedPenalty * 10) / 10;

  const reliabilityBase = Math.round(Math.max(10, Math.min(100, 92 + powertrain.reliabilityMod)));
  const emissionsScore = Math.round(powertrain.emissions * model.consistCars * 10) / 10;

  const assumedShipmentsPerDay = opts.shipmentsPerDayAssumption ?? Math.max(1, Math.round(capacityTonsTotal / 8));
  const assumedValuePerTon = opts.valuePerTonAssumption ?? 30;
  const dailyRevenue = assumedShipmentsPerDay * capacityTonsPerCar * assumedValuePerTon;
  const dailyNet = dailyRevenue - runningCostPerDay;
  const paybackDays = dailyNet > 0 ? Math.round(purchaseCost / dailyNet) : null;

  return {
    kind: 'freight',
    category: chassis.category, chassisName: chassis.name, manufacturer: chassis.manufacturer,
    powertrainLabel: powertrain.label, bodyStyle: chassis.bodyStyle,
    compatibleCargo: chassis.compatibleCargo,
    capacityTonsPerCar, capacityTonsTotal,
    purchaseCost, runningCostPerDay, topSpeed,
    reliabilityBase, emissionsScore,
    paybackDays, assumedShipmentsPerDay, assumedValuePerTon,
  };
}
