import { interiorObject } from './config.js';

// Reusable station interior designs, saved by the player from a finished
// station and keyed loosely by type+tier so they surface next to a matching
// new station. Persisted to localStorage as plain JSON - grids are small
// (a few hundred cells at most) so no need for anything fancier.
const STORAGE_KEY = 'stationBuilder.templates.v1';

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function listTemplates() {
  return loadAll();
}

export function templatesForType(typeId) {
  return loadAll().filter(t => t.typeId === typeId);
}

export function saveTemplate(name, station) {
  const list = loadAll();
  const template = {
    id: `tpl${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    name: (name || station.name || 'Untitled Template').slice(0, 40),
    typeId: station.typeId,
    tierId: station.tierId,
    w: station.w,
    d: station.d,
    levels: station.levels.map(l => ({
      name: l.name,
      servedType: l.servedType,
      grid: l.grid.map(row => row.slice()),
    })),
    createdAt: Date.now(),
  };
  list.push(template);
  saveAll(list);
  return template;
}

export function deleteTemplate(id) {
  saveAll(loadAll().filter(t => t.id !== id));
}

function transposeGrid(grid) {
  const rows = grid.length, cols = grid[0].length;
  const out = Array.from({ length: cols }, () => Array(rows).fill('empty'));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out[c][r] = grid[r][c];
  }
  return out;
}

// Whether a template's footprint fits a given station, either directly or
// rotated 90 degrees (in which case applyTemplate transposes the grids).
export function templateFits(template, station) {
  return (template.w === station.w && template.d === station.d)
    || (template.w === station.d && template.d === station.w);
}

// Overwrites as many of `station`'s levels as the template provides (from
// the ground level up), charging the net cost difference of every interior
// cell that changes - same delta-billing rule the layout editor's own brush
// uses - so applying a template isn't a way to dodge the interior budget.
export function applyTemplate(template, station, economy) {
  if (!templateFits(template, station)) {
    return { ok: false, reason: "This template's footprint doesn't match this station's size." };
  }
  const rotated = !(template.w === station.w && template.d === station.d);

  const levelCount = Math.min(template.levels.length, station.levels.length);
  if (levelCount === 0) return { ok: false, reason: 'Station has no levels to apply a template to.' };

  const newGrids = [];
  let cost = 0;
  for (let i = 0; i < levelCount; i++) {
    const grid = rotated ? transposeGrid(template.levels[i].grid) : template.levels[i].grid.map(row => row.slice());
    const targetGrid = station.levels[i].grid;
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[0].length; c++) {
        const cur = interiorObject(targetGrid[r]?.[c]);
        const next = interiorObject(grid[r][c]);
        cost += (next?.cost || 0) - (cur?.cost || 0);
      }
    }
    newGrids.push(grid);
  }

  if (cost > 0 && economy.budget < cost) {
    return { ok: false, reason: `Not enough budget to apply this template (need $${Math.round(cost).toLocaleString()}).` };
  }

  economy.budget -= cost;
  for (let i = 0; i < levelCount; i++) {
    station.levels[i].grid = newGrids[i];
    if (template.levels[i].servedType) station.levels[i].servedType = template.levels[i].servedType;
  }

  return { ok: true, cost, levelsApplied: levelCount, levelsSkipped: template.levels.length - levelCount };
}
