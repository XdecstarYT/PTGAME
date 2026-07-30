import {
  LAYOUT_CELL_SIZE, CELL_SIZE, INTERIOR_OBJECTS, interiorObject, SIZE_TIERS, LEVEL_COST_PER_CELL,
} from './config.js';

const LEVEL_NAMES = ['Ground / Street Level', 'Platform Level', 'Lower Concourse', 'Sub-Level'];

function emptyGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array(cols).fill('empty'));
}

// Canvas-based, snap-to-grid top-down interior editor for a single selected
// station. Owns the per-level object grids and all painting/level-add
// logic; ui.js wraps this with the palette/tabs/stats DOM around it.
export class LayoutEditor {
  constructor(canvas, { economy, onChange, onInsufficientFunds } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.economy = economy;
    this.onChange = onChange || (() => {});
    this.onInsufficientFunds = onInsufficientFunds || (() => {});
    this.station = null;
    this.brush = 'platform';
    this.activeLevel = 0;
    this._painting = false;
    this._eraseDrag = false;

    this._wireInput();
    window.addEventListener('resize', () => this.render());
  }

  setBrush(id) { this.brush = id; }
  setActiveLevel(i) { if (this.station && i >= 0 && i < this.station.levels.length) { this.activeLevel = i; this.render(); } }

  setStation(station) {
    this.station = station;
    if (!station.levels.length) {
      const rows = Math.round((station.d * CELL_SIZE) / LAYOUT_CELL_SIZE);
      const cols = Math.round((station.w * CELL_SIZE) / LAYOUT_CELL_SIZE);
      station.levels.push({ id: 'level0', name: LEVEL_NAMES[0], servedType: station.typeId, grid: emptyGrid(rows, cols) });
    }
    this.activeLevel = 0;
    this.render();
  }

  // Multi-modal interchanges can assign a different served transport mode
  // per level (e.g. a bus concourse above a subway platform) - statEngine.js
  // checks each level's platform length against its own servedType.
  setLevelServedType(index, typeId) {
    const level = this.station?.levels[index];
    if (!level) return;
    level.servedType = typeId;
    this.onChange();
  }

  get level() { return this.station ? this.station.levels[this.activeLevel] : null; }

  maxLevelsForStation() {
    const tier = SIZE_TIERS.find(t => t.id === this.station.tierId);
    return tier ? tier.maxLevels : 1;
  }

  levelAddCost() {
    return Math.round(this.station.w * this.station.d * LEVEL_COST_PER_CELL);
  }

  canAddLevel() {
    return this.station.levels.length < this.maxLevelsForStation();
  }

  addLevel() {
    if (!this.canAddLevel()) return { ok: false, reason: 'This size tier has no more levels available - upgrade the station first.' };
    const cost = this.levelAddCost();
    if (this.economy.budget < cost) return { ok: false, reason: `Not enough budget to add a level (need $${cost.toLocaleString()}).` };
    this.economy.budget -= cost;
    const rows = this.level.grid.length;
    const cols = this.level.grid[0].length;
    const idx = this.station.levels.length;
    this.station.levels.push({
      id: `level${idx}`, name: LEVEL_NAMES[idx] || `Level ${idx + 1}`,
      servedType: this.station.typeId, grid: emptyGrid(rows, cols),
    });
    this.activeLevel = idx;
    this.render();
    this.onChange();
    return { ok: true };
  }

  _wireInput() {
    const toGrid = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const level = this.level;
      if (!level) return null;
      const cols = level.grid[0].length, rows = level.grid.length;
      const cellPx = Math.min(rect.width / cols, rect.height / rows);
      const offX = (rect.width - cols * cellPx) / 2;
      const offY = (rect.height - rows * cellPx) / 2;
      const c = Math.floor((e.clientX - rect.left - offX) / cellPx);
      const r = Math.floor((e.clientY - rect.top - offY) / cellPx);
      if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
      return { r, c };
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      const g = toGrid(e);
      if (!g) return;
      this._painting = true;
      this._paint(g.r, g.c);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this._painting) return;
      const g = toGrid(e);
      if (g) this._paint(g.r, g.c);
    });
    window.addEventListener('pointerup', () => { this._painting = false; });
  }

  _paint(r, c) {
    const level = this.level;
    if (!level) return;
    const current = level.grid[r][c];
    if (current === this.brush) return;

    const currentObj = interiorObject(current);
    const nextObj = interiorObject(this.brush);
    const cost = (nextObj?.cost || 0) - (currentObj?.cost || 0);
    if (cost > 0 && this.economy.budget < cost) { this.onInsufficientFunds(nextObj); return; }

    this.economy.budget -= cost;
    level.grid[r][c] = this.brush;
    this.render();
    this.onChange();
  }

  render() {
    const canvas = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const level = this.level;
    if (!level) return;
    const cols = level.grid[0].length, rows = level.grid.length;
    const cellPx = Math.min(rect.width / cols, rect.height / rows);
    const offX = (rect.width - cols * cellPx) / 2;
    const offY = (rect.height - rows * cellPx) / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const obj = interiorObject(level.grid[r][c]) || INTERIOR_OBJECTS[0];
        ctx.fillStyle = obj.color;
        ctx.fillRect(offX + c * cellPx, offY + r * cellPx, cellPx + 0.5, cellPx + 0.5);
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath();
      ctx.moveTo(offX, offY + r * cellPx);
      ctx.lineTo(offX + cols * cellPx, offY + r * cellPx);
      ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath();
      ctx.moveTo(offX + c * cellPx, offY);
      ctx.lineTo(offX + c * cellPx, offY + rows * cellPx);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(offX, offY, cols * cellPx, rows * cellPx);
  }
}
