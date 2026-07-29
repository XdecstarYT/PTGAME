import { LAYOUT_CELL_SIZE } from './config.js';

// Connectivity/accessibility helpers over a station's per-level interior
// grids. Deliberately approximate (cell counts and run-lengths, not real
// pathfinding) - see docs/stat-formulas.md for what these numbers do and
// don't guarantee. Phase 3/4 walk mode is what actually proves a layout
// works, on foot.

export function countByType(level, typeId) {
  let n = 0;
  for (const row of level.grid) for (const cell of row) if (cell === typeId) n++;
  return n;
}

export function countEntrances(level) { return countByType(level, 'entrance'); }
export function countElevators(level) { return countByType(level, 'elevator'); }

// Any vertical circulation element at all (stairs count, but aren't
// wheelchair-accessible - see hasAccessibleVerticalLink).
export function hasVerticalLink(level) {
  return countByType(level, 'stairs') + countByType(level, 'escalator') + countByType(level, 'elevator') > 0;
}

export function hasAccessibleVerticalLink(level) {
  return countByType(level, 'elevator') > 0;
}

// Longest contiguous run of 'platform' cells along any single row or
// column, in meters - a rough proxy for "can this vehicle's consist fit".
export function longestPlatformRun(level) {
  const grid = level.grid;
  const rows = grid.length;
  const cols = rows ? grid[0].length : 0;
  let best = 0;

  for (let r = 0; r < rows; r++) {
    let run = 0;
    for (let c = 0; c < cols; c++) {
      run = grid[r][c] === 'platform' ? run + 1 : 0;
      if (run > best) best = run;
    }
  }
  for (let c = 0; c < cols; c++) {
    let run = 0;
    for (let r = 0; r < rows; r++) {
      run = grid[r][c] === 'platform' ? run + 1 : 0;
      if (run > best) best = run;
    }
  }
  return best * LAYOUT_CELL_SIZE;
}

// A station is considered to have a fully accessible route between levels
// only if every non-ground level can be reached by elevator. Single-level
// stations are accessible at street level by definition.
export function accessibleRouteExists(station) {
  if (station.levels.length <= 1) return true;
  return station.levels.slice(1).every(hasAccessibleVerticalLink);
}

export function anyVerticalLinkOnEveryLevel(station) {
  if (station.levels.length <= 1) return true;
  return station.levels.slice(1).every(hasVerticalLink);
}
