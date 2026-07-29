import { CELL_SIZE, MIN_ENTRANCES, TARGET_THROUGHPUT, REQUIRED_PLATFORM_LENGTH_M, interiorObject } from './config.js';
import {
  countByType, countEntrances, longestPlatformRun, accessibleRouteExists,
} from './circulation.js';

// Per-hour throughput contributed by one cell/unit of each element. See
// docs/stat-formulas.md for the reasoning and caveats behind every number
// in this file - these are deliberately simple, documented approximations,
// not a real pedestrian microsimulation.
const PLATFORM_PAX_PER_HOUR = 90;
const WAITING_PAX_PER_HOUR = 20;
const TURNSTILE_PAX_PER_HOUR = 600;
const ENTRANCE_PAX_PER_HOUR = 400;
const VERTICAL_CAP_PER_HOUR = { stairs: 150, escalator: 400, elevator: 120 };
const WALK_SPEED_M_PER_S = 1.2;

function levelPlatformThroughput(level) {
  return countByType(level, 'platform') * PLATFORM_PAX_PER_HOUR
    + countByType(level, 'waiting_area') * WAITING_PAX_PER_HOUR;
}

function levelGateThroughput(level) {
  return countByType(level, 'turnstile') * TURNSTILE_PAX_PER_HOUR
    + countEntrances(level) * ENTRANCE_PAX_PER_HOUR;
}

function levelVerticalCapacity(level) {
  return countByType(level, 'stairs') * VERTICAL_CAP_PER_HOUR.stairs
    + countByType(level, 'escalator') * VERTICAL_CAP_PER_HOUR.escalator
    + countByType(level, 'elevator') * VERTICAL_CAP_PER_HOUR.elevator;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

export function computeStats(station) {
  const warnings = [];
  const levels = station.levels;

  let platformThroughput = 0, gateThroughput = 0, interiorCost = 0;
  let entranceCount = 0, elevatorCount = 0;
  let worstVerticalRisk = 0;

  for (const level of levels) {
    platformThroughput += levelPlatformThroughput(level);
    gateThroughput += levelGateThroughput(level);
    entranceCount += countEntrances(level);
    elevatorCount += countByType(level, 'elevator');
    for (const row of level.grid) {
      for (const cellId of row) {
        const obj = interiorObject(cellId);
        if (obj && obj.cost) interiorCost += obj.cost;
      }
    }
    const demand = levelPlatformThroughput(level);
    const cap = levelVerticalCapacity(level);
    if (demand > 0 && levels.length > 1) {
      const risk = clamp(Math.round(100 * Math.max(0, (demand - cap) / demand)), 0, 100);
      if (risk > worstVerticalRisk) worstVerticalRisk = risk;
    }
  }

  const capacity = Math.round(Math.min(platformThroughput, gateThroughput || platformThroughput));

  const gateRisk = platformThroughput > 0
    ? clamp(Math.round(100 * Math.max(0, (platformThroughput - gateThroughput) / platformThroughput)), 0, 100)
    : 0;
  const congestionRisk = Math.max(gateRisk, worstVerticalRisk);

  const minEntrances = MIN_ENTRANCES[station.tierId] || 1;
  const entranceScore = clamp((entranceCount / minEntrances) * 60, 0, 60);
  const accessible = accessibleRouteExists(station);
  const accessScore = accessible ? 40 : 0;
  const accessibilityRating = Math.round(entranceScore + accessScore);
  const accessibilityCompliant = entranceCount >= minEntrances && accessible;

  const requiredPlatformLength = REQUIRED_PLATFORM_LENGTH_M[station.typeId] || 0;
  const platformLength = Math.max(...levels.map(longestPlatformRun), 0);
  const platformLengthOk = platformLength >= requiredPlatformLength;

  const diagonal = Math.hypot(station.w * CELL_SIZE, station.d * CELL_SIZE);
  const baseWalkMin = diagonal / WALK_SPEED_M_PER_S / 60;
  const dwellTimeMin = Math.round(baseWalkMin * (1 + congestionRisk / 100) * 10) / 10;

  if (entranceCount < minEntrances) {
    warnings.push(`Needs at least ${minEntrances} entrance/exit${minEntrances > 1 ? 's' : ''} for this size tier (has ${entranceCount}).`);
  }
  if (!accessible) {
    warnings.push('No accessible (elevator) route between levels - add an elevator on every non-ground level.');
  }
  if (!platformLengthOk) {
    warnings.push(`Longest platform run is ${platformLength}m; this station type needs at least ${requiredPlatformLength}m.`);
  }
  if (gateRisk > 40) {
    warnings.push('Entrances/turnstiles are a bottleneck versus platform demand - add more gates or widen access.');
  }
  if (worstVerticalRisk > 40) {
    warnings.push('Stairs/escalators/elevators can\'t keep up with platform demand on at least one level.');
  }

  return {
    capacity,
    targetThroughput: TARGET_THROUGHPUT[station.tierId] || 0,
    congestionRisk,
    accessibilityRating,
    accessibilityCompliant,
    interiorCost,
    dwellTimeMin,
    entranceCount,
    minEntrances,
    elevatorCount,
    platformLength,
    requiredPlatformLength,
    platformLengthOk,
    warnings,
  };
}
