import { FOOTPRINT_PRESETS, WALL_MATERIALS, BUILD_PIECES, MAX_LEVELS, footprintPreset } from './buildingDefs.js';
import { createDefaultBuildingDesign, createEmptyLevelGrid } from './buildingModel.js';
import { BuildingScene } from './buildingScene.js';

function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }

// Freeform Building Creator: a "Structure" tab for painting prefab pieces
// (walls/windows/doors/floors/roofs) per floor on a grid - the same
// paint-a-grid interaction already proven in the station builder's layout
// editor, live-previewed in 3D. A "Details" tab (Phase 2) will add
// Minecraft-style voxel blocks layered on top for freeform decoration.
export class BuildingEditor {
  constructor() {
    this.dom = {
      layer: document.getElementById('building-layer'),
      close: document.getElementById('building-close'),
      tabContent: document.getElementById('building-tab-content'),
      canvas: document.getElementById('building-viewport'),
      stats: document.getElementById('building-stats'),
      tabButtons: [...document.querySelectorAll('.building-tab')],
    };
    this.scene = new BuildingScene(this.dom.canvas);
    this.isOpen = false;
    this.design = null;
    this.activeLevel = 0;
    this.brush = 'wall';

    this.dom.close.addEventListener('click', () => this.close());
    for (const btn of this.dom.tabButtons) {
      btn.addEventListener('click', () => this._renderTab());
    }
  }

  open() {
    this.isOpen = true;
    this.dom.layer.classList.remove('hidden');
    if (!this.design) this.newDesign('small');
    else this._refreshAll();
    this.scene._resizeToContainer();
  }

  close() { this.isOpen = false; this.dom.layer.classList.add('hidden'); }

  newDesign(footprintId) {
    this.design = createDefaultBuildingDesign(footprintId);
    this.activeLevel = 0;
    this._refreshAll();
  }

  render(dtSeconds) { if (this.isOpen) this.scene.render(dtSeconds); }

  _refreshAll() {
    this.scene.setDesign(this.design);
    this._renderTab();
    this._renderStats();
  }

  _renderTab() {
    const design = this.design;
    const footprintButtons = FOOTPRINT_PRESETS.map(f => `
      <button class="piece-brush ${design.footprintId === f.id ? 'active' : ''}" data-footprint="${f.id}">${f.label} (${f.cols}×${f.rows})</button>
    `).join('');

    const levelTabs = design.levels.map((lvl, i) => `
      <button class="building-level-tab ${i === this.activeLevel ? 'active' : ''}" data-level="${i}">Floor ${i + 1}</button>
    `).join('');
    const addLevelBtn = design.levels.length < MAX_LEVELS
      ? '<button class="building-level-tab add-level" id="building-add-level">+ Floor</button>' : '';

    const materialButtons = WALL_MATERIALS.map(m => `
      <button class="material-swatch ${design.levels[this.activeLevel].wallMaterialId === m.id ? 'active' : ''}" data-material="${m.id}">
        <span class="swatch-dot" style="background:#${m.color.toString(16).padStart(6, '0')}"></span>${m.label}
      </button>
    `).join('');

    const pieceButtons = BUILD_PIECES.map(p => `
      <button class="piece-brush ${this.brush === p.id ? 'active' : ''}" data-piece="${p.id}">${p.icon} ${p.name}</button>
    `).join('');

    this.dom.tabContent.innerHTML = `
      <h4>Footprint</h4>
      <div class="piece-brush-row">${footprintButtons}</div>
      <h4>Floors</h4>
      <div class="building-level-tabs">${levelTabs}${addLevelBtn}</div>
      <h4>Wall Material (this floor)</h4>
      <div class="material-swatch-row">${materialButtons}</div>
      <h4>Place</h4>
      <div class="piece-brush-row">${pieceButtons}</div>
      <canvas id="building-grid-canvas"></canvas>
      <p class="designer-hint">Click, or click-drag, to paint the current floor. Switch floors above to build upward.</p>
    `;

    this.dom.tabContent.querySelectorAll('[data-footprint]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.footprint === this.design.footprintId) return;
        this.newDesign(btn.dataset.footprint);
      });
    });
    this.dom.tabContent.querySelectorAll('[data-level]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeLevel = Number(btn.dataset.level);
        this._renderTab();
      });
    });
    document.getElementById('building-add-level')?.addEventListener('click', () => {
      this.design.levels.push({ grid: createEmptyLevelGrid(this.design.cols, this.design.rows), wallMaterialId: 'concrete' });
      this.activeLevel = this.design.levels.length - 1;
      this._refreshAll();
    });
    this.dom.tabContent.querySelectorAll('[data-material]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.design.levels[this.activeLevel].wallMaterialId = btn.dataset.material;
        this._refreshAll();
      });
    });
    this.dom.tabContent.querySelectorAll('[data-piece]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.brush = btn.dataset.piece;
        this.dom.tabContent.querySelectorAll('[data-piece]').forEach(b => b.classList.toggle('active', b.dataset.piece === this.brush));
      });
    });

    this._wireGridCanvas();
    this._drawGrid();
  }

  _wireGridCanvas() {
    const canvas = document.getElementById('building-grid-canvas');
    let painting = false;
    const toCell = (e) => {
      const rect = canvas.getBoundingClientRect();
      const cols = this.design.cols, rows = this.design.rows;
      const cellPx = Math.min(rect.width / cols, rect.height / rows);
      const offX = (rect.width - cols * cellPx) / 2;
      const offY = (rect.height - rows * cellPx) / 2;
      const c = Math.floor((e.clientX - rect.left - offX) / cellPx);
      const r = Math.floor((e.clientY - rect.top - offY) / cellPx);
      if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
      return { r, c };
    };
    const paint = (r, c) => {
      const level = this.design.levels[this.activeLevel];
      if (level.grid[r][c] === this.brush) return;
      level.grid[r][c] = this.brush;
      this._drawGrid();
      this.scene.setDesign(this.design);
      this._renderStats();
    };
    canvas.addEventListener('pointerdown', (e) => {
      painting = true;
      const cell = toCell(e);
      if (cell) paint(cell.r, cell.c);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!painting) return;
      const cell = toCell(e);
      if (cell) paint(cell.r, cell.c);
    });
    window.addEventListener('pointerup', () => { painting = false; });
  }

  _drawGrid() {
    const canvas = document.getElementById('building-grid-canvas');
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const level = this.design.levels[this.activeLevel];
    const cols = this.design.cols, rows = this.design.rows;
    const cellPx = Math.min(rect.width / cols, rect.height / rows);
    const offX = (rect.width - cols * cellPx) / 2;
    const offY = (rect.height - rows * cellPx) / 2;

    const colorFor = (id) => ({
      empty: '#232633', wall: '#8a8a8a', window: '#5b8ac9', door: '#a97c50',
      pillar: '#c9a63d', floor: '#4a4d55', roof_flat: '#6f5f4a', roof_slope: '#8f7a5a',
    }[id] || '#232633');

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = colorFor(level.grid[r][c]);
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

  _renderStats() {
    const design = this.design;
    let wallCount = 0, windowCount = 0, doorCount = 0;
    for (const level of design.levels) {
      for (const row of level.grid) {
        for (const cell of row) {
          if (cell === 'wall' || cell === 'pillar') wallCount++;
          else if (cell === 'window') windowCount++;
          else if (cell === 'door') doorCount++;
        }
      }
    }
    this.dom.stats.innerHTML = `
      <div class="row"><span>${design.name}</span></div>
      <div class="row"><span>Footprint</span><b>${footprintPreset(design.footprintId).label}</b></div>
      <div class="row"><span>Floors</span><b>${design.levels.length}</b></div>
      <div class="row"><span>Walls / pillars</span><b>${wallCount}</b></div>
      <div class="row"><span>Windows</span><b>${windowCount}</b></div>
      <div class="row"><span>Doors</span><b>${doorCount}</b></div>
      ${doorCount === 0 ? '<div class="row violation">⚠️ No doors placed - add at least one entrance.</div>' : ''}
    `;
  }
}
