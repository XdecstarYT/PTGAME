import {
  nextTier, stationType, TIER_UPGRADE_COST_MULT, KIOSK_REVENUE_PER_HOUR, CELL_SIZE, LAYOUT_CELL_SIZE,
} from './config.js';
import { computeStats } from './statEngine.js';

// Pure cost/eligibility calculation so ui.js can show "Upgrade to X ($cost)"
// before the player commits - the actual mutation happens in
// placement.js's upgradeStation(), which also needs scene/mesh access.
export function tierUpgradePlan(station) {
  const next = nextTier(station.tierId);
  if (!next) return null;
  const newW = station.rotated ? next.d : next.w;
  const newD = station.rotated ? next.w : next.d;
  const oldArea = station.w * station.d;
  const newArea = newW * newD;
  const type = stationType(station.typeId);
  const cost = Math.round(Math.max(0, newArea - oldArea) * type.costPerCell * TIER_UPGRADE_COST_MULT);
  return { next, newW, newD, cost };
}

// Grows every level's interior grid to match the station's current
// (already-updated) footprint, keeping existing painted cells anchored at
// their original top-left position. Called right after a tier upgrade
// resizes station.w/station.d.
export function resizeLevelGrids(station) {
  const newRows = Math.round((station.d * CELL_SIZE) / LAYOUT_CELL_SIZE);
  const newCols = Math.round((station.w * CELL_SIZE) / LAYOUT_CELL_SIZE);
  for (const level of station.levels) {
    const oldGrid = level.grid;
    const newGrid = [];
    for (let r = 0; r < newRows; r++) {
      const row = [];
      for (let c = 0; c < newCols; c++) row.push(oldGrid[r]?.[c] ?? 'empty');
      newGrid.push(row);
    }
    level.grid = newGrid;
  }
}

// Passive kiosk income for a real-time interval, scaled by how close each
// station's current capacity is to its tier's target throughput - a
// well-used station's shops earn more than an empty one's. Not tied to a
// day/night clock since this standalone tool doesn't have one; main.js
// calls this on a fixed real-time tick.
export function kioskRevenueForStations(stations, intervalSeconds) {
  let total = 0;
  for (const station of stations) {
    let kioskCount = 0;
    for (const level of station.levels) {
      for (const row of level.grid) for (const cell of row) if (cell === 'kiosk') kioskCount++;
    }
    if (!kioskCount) continue;
    const stats = computeStats(station);
    const ratio = stats.targetThroughput > 0
      ? Math.min(1.5, Math.max(0.2, stats.capacity / stats.targetThroughput))
      : 0.5;
    total += kioskCount * KIOSK_REVENUE_PER_HOUR * ratio * (intervalSeconds / 3600);
  }
  return total;
}
