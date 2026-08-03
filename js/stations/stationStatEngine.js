// Ported from station-builder/js/circulation.js + statEngine.js - deliberately
// simple, documented approximations (cell counts and run-lengths), not a real
// pedestrian microsimulation. See that tool's docs/stat-formulas.md for the
// reasoning behind the numbers below.
import {
  LAYOUT_CELL_SIZE, STATION_MIN_ENTRANCES, STATION_TARGET_THROUGHPUT, STATION_REQUIRED_PLATFORM_LENGTH_M,
  stationInteriorObject,
} from './stationDefs.js';

function countByType(level, typeId) {
  let n = 0;
  for (const row of level.grid) for (const cell of row) if (cell === typeId) n++;
  return n;
}

function countEntrances(level) { return countByType(level, 'entrance'); }

function hasVerticalLink(level) {
  return countByType(level, 'stairs') + countByType(level, 'escalator') + countByType(level, 'elevator') > 0;
}
function hasAccessibleVerticalLink(level) { return countByType(level, 'elevator') > 0; }

function longestPlatformRun(level) {
  const grid = level.grid;
  const rows = grid.length;
  const cols = rows ? grid[0].length : 0;
  let best = 0;
  for (let r = 0; r < rows; r++) {
    let run = 0;
    for (let c = 0; c < cols; c++) { run = grid[r][c] === 'platform' ? run + 1 : 0; if (run > best) best = run; }
  }
  for (let c = 0; c < cols; c++) {
    let run = 0;
    for (let r = 0; r < rows; r++) { run = grid[r][c] === 'platform' ? run + 1 : 0; if (run > best) best = run; }
  }
  return best * LAYOUT_CELL_SIZE;
}

function accessibleRouteExists(design) {
  if (design.levels.length <= 1) return true;
  return design.levels.slice(1).every(hasAccessibleVerticalLink);
}

const PLATFORM_PAX_PER_HOUR = 90;
const WAITING_PAX_PER_HOUR = 20;
const TURNSTILE_PAX_PER_HOUR = 600;
const ENTRANCE_PAX_PER_HOUR = 400;
const VERTICAL_CAP_PER_HOUR = { stairs: 150, escalator: 400, elevator: 120 };
const WALK_SPEED_M_PER_S = 1.2;

function levelPlatformThroughput(level) {
  return countByType(level, 'platform') * PLATFORM_PAX_PER_HOUR + countByType(level, 'waiting_area') * WAITING_PAX_PER_HOUR;
}
function levelGateThroughput(level) {
  return countByType(level, 'turnstile') * TURNSTILE_PAX_PER_HOUR + countEntrances(level) * ENTRANCE_PAX_PER_HOUR;
}
function levelVerticalCapacity(level) {
  return countByType(level, 'stairs') * VERTICAL_CAP_PER_HOUR.stairs
    + countByType(level, 'escalator') * VERTICAL_CAP_PER_HOUR.escalator
    + countByType(level, 'elevator') * VERTICAL_CAP_PER_HOUR.elevator;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// design: { typeId, tierId, w, d, levels: [{ name, servedType, grid }] }
export function computeStationStats(design) {
  const warnings = [];
  const levels = design.levels;

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
        const obj = stationInteriorObject(cellId);
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

  const minEntrances = STATION_MIN_ENTRANCES[design.tierId] || 1;
  const entranceScore = clamp((entranceCount / minEntrances) * 60, 0, 60);
  const accessible = accessibleRouteExists(design);
  const accessScore = accessible ? 40 : 0;
  const accessibilityRating = Math.round(entranceScore + accessScore);
  const accessibilityCompliant = entranceCount >= minEntrances && accessible;

  const platformChecks = levels.map(level => {
    const servedType = level.servedType || design.typeId;
    const required = STATION_REQUIRED_PLATFORM_LENGTH_M[servedType] || 0;
    const length = longestPlatformRun(level);
    return { levelName: level.name, servedType, required, length, ok: length >= required };
  });
  const platformLengthOk = platformChecks.every(c => c.ok);
  const worstCheck = platformChecks.find(c => !c.ok) || platformChecks[0] || { length: 0, required: 0 };

  const diagonal = Math.hypot(design.w * 2, design.d * 2);
  const baseWalkMin = diagonal / WALK_SPEED_M_PER_S / 60;
  const dwellTimeMin = Math.round(baseWalkMin * (1 + congestionRisk / 100) * 10) / 10;

  if (entranceCount < minEntrances) {
    warnings.push(`Needs at least ${minEntrances} entrance/exit${minEntrances > 1 ? 's' : ''} for this size tier (has ${entranceCount}).`);
  }
  if (!accessible) warnings.push('No accessible (elevator) route between levels - add an elevator on every non-ground level.');
  for (const c of platformChecks) {
    if (c.ok) continue;
    const label = levels.length > 1 ? `${c.levelName} (${c.servedType})` : 'this station type';
    warnings.push(`Longest platform run on ${label} is ${c.length}m; needs at least ${c.required}m.`);
  }
  if (gateRisk > 40) warnings.push('Entrances/turnstiles are a bottleneck versus platform demand - add more gates or widen access.');
  if (worstVerticalRisk > 40) warnings.push('Stairs/escalators/elevators can\'t keep up with platform demand on at least one level.');

  return {
    capacity,
    targetThroughput: STATION_TARGET_THROUGHPUT[design.tierId] || 0,
    congestionRisk,
    accessibilityRating,
    accessibilityCompliant,
    interiorCost,
    dwellTimeMin,
    entranceCount,
    minEntrances,
    elevatorCount,
    platformLength: worstCheck.length,
    requiredPlatformLength: worstCheck.required,
    platformLengthOk,
    platformChecks,
    warnings,
  };
}

// Sums every shop cell's revenuePerDay across all levels, scaled by how busy
// the station actually is (capacity vs its tier's target throughput) - an
// empty, under-used station's shops barely earn anything, a packed one earns
// close to (or a bit above) the base rate. `stats` can be passed in if the
// caller already has a fresh computeStationStats() result for this design
// (e.g. network.js's station.designStats), to avoid recomputing it.
export function computeStationShopRevenue(design, stats = null) {
  const s = stats || computeStationStats(design);
  const ratio = s.targetThroughput > 0
    ? Math.min(1.5, Math.max(0.15, s.capacity / s.targetThroughput))
    : 0.5;
  let base = 0;
  for (const level of design.levels) {
    for (const row of level.grid) {
      for (const cellId of row) {
        const obj = stationInteriorObject(cellId);
        if (obj && obj.category === 'shop') base += obj.revenuePerDay || 0;
      }
    }
  }
  return base * ratio;
}
