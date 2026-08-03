import {
  STATION_DESIGN_TYPES, STATION_SIZE_TIERS, STATION_INTERIOR_OBJECTS, STATION_ARCHITECTURE_STYLES,
  stationDesignType, stationTier, stationInteriorObject, stationArchitectureStyle, stationDesignCost,
} from './stationDefs.js';
import { createDefaultStationDesign, addStationLevel, removeStationLevel } from './stationModel.js';
import { computeStationStats } from './stationStatEngine.js';
import { StationScene } from './stationScene.js';

// In-game Station Designer: pick a transit type + size tier, then paint
// platforms/entrances/circulation/amenities per level on a 2D grid (the same
// canvas-paint interaction as the Building Creator's Structure tab), with a
// live 3D shell preview and live capacity/congestion/accessibility stats.
// A pragmatic, from-scratch bridge for the standalone station-builder tool's
// design concepts (see js/stations/stationDefs.js/stationStatEngine.js) - not
// a port of that tool's full 3D layout editor/architecture/furniture system.
export class StationDesigner {
  constructor({ catalog, ui } = {}) {
    this.catalog = catalog;
    this.ui = ui;
    this.dom = {
      layer: document.getElementById('station-layer'),
      close: document.getElementById('station-close'),
      tabContent: document.getElementById('station-tab-content'),
      canvas: document.getElementById('station-viewport'),
      stats: document.getElementById('station-stats'),
      showroomBtn: document.getElementById('station-showroom-btn'),
      newBtn: document.getElementById('station-new-btn'),
      saveBtn: document.getElementById('station-save-btn'),
    };
    this.scene = new StationScene(this.dom.canvas);
    this.isOpen = false;
    this.design = null;
    this.activeLevel = 0;
    this.brush = 'platform';
    this.onSave = null; // optional callback(savedDesign) - set by whoever opened the designer for a placement flow

    this.dom.close.addEventListener('click', () => this.close());
    this.dom.showroomBtn.addEventListener('click', () => this.openShowroom());
    this.dom.newBtn.addEventListener('click', () => this.newDesign());
    this.dom.saveBtn.addEventListener('click', () => this.save());
  }

  open(onSave = null) {
    this.isOpen = true;
    this.onSave = onSave;
    this.dom.layer.classList.remove('hidden');
    if (!this.design) this.newDesign();
    else this._refreshAll();
    this.scene._resizeToContainer();
  }

  close() { this.isOpen = false; this.dom.layer.classList.add('hidden'); }

  newDesign(typeId = 'bus_stop', tierId = 'small') {
    this.design = createDefaultStationDesign(typeId, tierId);
    this.activeLevel = 0;
    this._refreshAll();
  }

  loadForEdit(designId) {
    const src = this.catalog.get(designId);
    if (!src) return;
    this.design = JSON.parse(JSON.stringify(src));
    this.activeLevel = 0;
    this.open();
  }

  render() { if (this.isOpen) this.scene.render(); }

  _refreshAll() {
    this.scene.setDesign(this.design);
    this._renderTab();
    this._renderStats();
  }

  _renderTab() {
    const design = this.design;

    const typeButtons = STATION_DESIGN_TYPES.map(t => `
      <button class="piece-brush ${design.typeId === t.id ? 'active' : ''}" data-type="${t.id}">${t.icon} ${t.name}</button>
    `).join('');

    const tierButtons = STATION_SIZE_TIERS.map(t => `
      <button class="piece-brush ${design.tierId === t.id ? 'active' : ''}" data-tier="${t.id}">${t.name} (${t.w}×${t.d})</button>
    `).join('');

    const levelTabs = design.levels.map((lvl, i) => `
      <button class="building-level-tab ${i === this.activeLevel ? 'active' : ''}" data-level="${i}">${lvl.name}</button>
    `).join('');
    const tier = stationTier(design.tierId);
    const addLevelBtn = design.levels.length < tier.maxLevels
      ? '<button class="building-level-tab add-level" id="station-add-level">+ Level</button>' : '';
    const removeLevelBtn = design.levels.length > 1
      ? '<button class="building-level-tab add-level" id="station-remove-level">− Level</button>' : '';

    const styleButtons = STATION_ARCHITECTURE_STYLES.map(s => `
      <button class="material-swatch ${design.architectureStyleId === s.id ? 'active' : ''}" data-arch-style="${s.id}">
        <span class="swatch-dot" style="background:#${s.wall.toString(16).padStart(6, '0')}"></span>${s.icon} ${s.name}
      </button>
    `).join('');

    const pieceButtons = STATION_INTERIOR_OBJECTS.map(p => `
      <button class="piece-brush ${this.brush === p.id ? 'active' : ''}" data-piece="${p.id}">${p.icon} ${p.name}</button>
    `).join('');

    this.dom.tabContent.innerHTML = `
      <h4>Station Type</h4>
      <div class="piece-brush-row">${typeButtons}</div>
      <h4>Size Tier</h4>
      <div class="piece-brush-row">${tierButtons}</div>
      <h4>Levels</h4>
      <div class="building-level-tabs">${levelTabs}${addLevelBtn}${removeLevelBtn}</div>
      <h4>Architecture Style</h4>
      <div class="material-swatch-row">${styleButtons}</div>
      <h4>Paint</h4>
      <div class="piece-brush-row">${pieceButtons}</div>
      <canvas id="station-grid-canvas"></canvas>
      <p class="designer-hint">Click, or click-drag, to paint the current level. Platforms need entrances/gates and (for multi-level hubs) an elevator to stay accessible.</p>
    `;

    this.dom.tabContent.querySelectorAll('[data-type]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.type === this.design.typeId) return;
        this.design.typeId = btn.dataset.type;
        for (const level of this.design.levels) level.servedType = this.design.typeId;
        this._refreshAll();
      });
    });
    this.dom.tabContent.querySelectorAll('[data-tier]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tier === this.design.tierId) return;
        this.newDesign(this.design.typeId, btn.dataset.tier);
      });
    });
    this.dom.tabContent.querySelectorAll('[data-level]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeLevel = Number(btn.dataset.level);
        this._renderTab();
      });
    });
    document.getElementById('station-add-level')?.addEventListener('click', () => {
      if (!addStationLevel(this.design)) return;
      this.activeLevel = this.design.levels.length - 1;
      this._refreshAll();
    });
    document.getElementById('station-remove-level')?.addEventListener('click', () => {
      if (!removeStationLevel(this.design)) return;
      this.activeLevel = Math.min(this.activeLevel, this.design.levels.length - 1);
      this._refreshAll();
    });
    this.dom.tabContent.querySelectorAll('[data-arch-style]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.design.architectureStyleId = btn.dataset.archStyle;
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
    const canvas = document.getElementById('station-grid-canvas');
    let painting = false;
    const grid = () => this.design.levels[this.activeLevel].grid;
    const toCell = (e) => {
      const rect = canvas.getBoundingClientRect();
      const rows = grid().length, cols = grid()[0].length;
      const cellPx = Math.min(rect.width / cols, rect.height / rows);
      const offX = (rect.width - cols * cellPx) / 2;
      const offY = (rect.height - rows * cellPx) / 2;
      const c = Math.floor((e.clientX - rect.left - offX) / cellPx);
      const r = Math.floor((e.clientY - rect.top - offY) / cellPx);
      if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
      return { r, c };
    };
    const paint = (r, c) => {
      const g = grid();
      if (g[r][c] === this.brush) return;
      g[r][c] = this.brush;
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
    const canvas = document.getElementById('station-grid-canvas');
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const grid = this.design.levels[this.activeLevel].grid;
    const rows = grid.length, cols = grid[0].length;
    const cellPx = Math.min(rect.width / cols, rect.height / rows);
    const offX = (rect.width - cols * cellPx) / 2;
    const offY = (rect.height - rows * cellPx) / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const obj = stationInteriorObject(grid[r][c]) || stationInteriorObject('empty');
        ctx.fillStyle = obj.color;
        ctx.fillRect(offX + c * cellPx, offY + r * cellPx, cellPx + 0.5, cellPx + 0.5);
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let r = 0; r <= rows; r++) {
      ctx.beginPath(); ctx.moveTo(offX, offY + r * cellPx); ctx.lineTo(offX + cols * cellPx, offY + r * cellPx); ctx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
      ctx.beginPath(); ctx.moveTo(offX + c * cellPx, offY); ctx.lineTo(offX + c * cellPx, offY + rows * cellPx); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(offX, offY, cols * cellPx, rows * cellPx);
  }

  _renderStats() {
    const design = this.design;
    const stats = computeStationStats(design);
    const type = stationDesignType(design.typeId);
    const cost = stationDesignCost(design);
    const warningsHtml = stats.warnings.map(w => `<div class="row violation">⚠️ ${w}</div>`).join('');

    this.dom.stats.innerHTML = `
      <div class="row"><span>${design.name}</span></div>
      <div class="row"><span>Type</span><b>${type.icon} ${type.name}</b></div>
      <div class="row"><span>Footprint cost</span><b>$${cost.toLocaleString()}</b></div>
      <div class="row"><span>Capacity</span><b>${stats.capacity.toLocaleString()}/hr</b> <span style="opacity:.6">(target ${stats.targetThroughput.toLocaleString()})</span></div>
      <div class="row"><span>Congestion risk</span><b style="color:${stats.congestionRisk > 40 ? '#ff6b6b' : '#6ee7c9'}">${stats.congestionRisk}%</b></div>
      <div class="row"><span>Accessibility</span><b style="color:${stats.accessibilityCompliant ? '#6ee7c9' : '#ffd166'}">${stats.accessibilityRating}/100</b></div>
      <div class="row"><span>Entrances</span><b>${stats.entranceCount} / ${stats.minEntrances} min</b></div>
      <div class="row"><span>Longest platform</span><b>${stats.platformLength}m / ${stats.requiredPlatformLength}m needed</b></div>
      <div class="row"><span>Dwell time</span><b>${stats.dwellTimeMin} min</b></div>
      ${warningsHtml}
    `;
  }

  // ---------------- save / gallery ----------------

  save() {
    const nameInput = window.prompt('Name this station design:', this.design.name);
    if (nameInput === null) return;
    this.design.name = nameInput || this.design.name;
    this.design.thumbnail = this.scene.snapshot();
    const saved = this.catalog.save(this.design);
    this.ui.showToast(`Saved "${saved.name}" to your station gallery.`);
    if (this.onSave) {
      const cb = this.onSave;
      this.onSave = null;
      this.close();
      cb(saved);
    }
  }

  openShowroom() {
    const designs = this.catalog.list();
    const cards = designs.map(d => {
      const type = stationDesignType(d.typeId);
      const tier = stationTier(d.tierId);
      return `
      <div class="showroom-card">
        <img src="${d.thumbnail || ''}" class="showroom-thumb ${d.thumbnail ? '' : 'hidden'}">
        <div class="showroom-name">${d.name}</div>
        <div class="showroom-meta">${type.icon} ${type.name} · ${tier.name} · ${d.levels.length} level${d.levels.length === 1 ? '' : 's'}</div>
        <div class="showroom-actions">
          <button class="action secondary" data-edit="${d.id}">Edit</button>
          <button class="action secondary" data-clone="${d.id}">Clone</button>
          <button class="action secondary" data-export="${d.id}">Export</button>
          <button class="action danger" data-delete="${d.id}">Delete</button>
        </div>
      </div>`;
    }).join('') || '<p>No station designs yet - use "New" in the Station Designer to make one.</p>';

    this.ui.openModal('Station Design Gallery', `
      <div class="showroom-toolbar">
        <label class="action secondary" style="cursor:pointer">Import JSON<input type="file" id="station-showroom-import" accept=".json" class="hidden"></label>
      </div>
      <div class="showroom-grid">${cards}</div>
    `);

    const content = this.ui.dom.modalContent;
    content.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => { this.ui.closeModal(); this.loadForEdit(b.dataset.edit); }));
    content.querySelectorAll('[data-clone]').forEach(b => b.addEventListener('click', () => { this.catalog.clone(b.dataset.clone); this.openShowroom(); }));
    content.querySelectorAll('[data-export]').forEach(b => b.addEventListener('click', () => this.catalog.downloadExport(b.dataset.export)));
    content.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => {
      this.catalog.remove(b.dataset.delete);
      this.openShowroom();
    }));
    document.getElementById('station-showroom-import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try { await this.catalog.importFromFile(file); this.ui.showToast('Design imported.'); this.openShowroom(); }
      catch (err) { this.ui.showToast(err.message); }
    });
  }
}
