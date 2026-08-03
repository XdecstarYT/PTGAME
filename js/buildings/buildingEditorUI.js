import { FOOTPRINT_PRESETS, WALL_MATERIALS, ROOF_MATERIALS, BUILD_PIECES, MAX_LEVELS, VOXEL_MATERIALS, BUILD_CELL_SIZE, footprintPreset } from './buildingDefs.js';
import { createDefaultBuildingDesign, createEmptyLevelGrid, addVoxel, removeVoxelAt } from './buildingModel.js';
import { worldPointToVoxelCoord, structureGridOrigin } from './buildingMeshBuilder.js';
import { BuildingScene } from './buildingScene.js';
import { FreeformClickPicker, worldPointToGridCell } from '../shared/freeformPlacement.js';

function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }

// Freeform Building Creator: a "Structure" tab for placing prefab pieces
// (walls/windows/doors/floors/roofs) per floor by clicking directly in the
// 3D preview, Bloxburg-style - plus a "Details" tab with Minecraft-style
// voxel blocks clicked onto the same preview, layered on top for freeform
// decoration. Both tabs share one click-vs-drag picker (FreeformClickPicker)
// so a click always resolves to *some* grid cell/voxel instead of nudging
// the OrbitControls camera.
export class BuildingEditor {
  constructor({ catalog, ui } = {}) {
    this.catalog = catalog;
    this.ui = ui;
    this.dom = {
      layer: document.getElementById('building-layer'),
      close: document.getElementById('building-close'),
      tabContent: document.getElementById('building-tab-content'),
      canvas: document.getElementById('building-viewport'),
      stats: document.getElementById('building-stats'),
      tabButtons: [...document.querySelectorAll('.building-tab')],
      showroomBtn: document.getElementById('building-showroom-btn'),
      newBtn: document.getElementById('building-new-btn'),
      saveBtn: document.getElementById('building-save-btn'),
    };
    this.scene = new BuildingScene(this.dom.canvas);
    this.isOpen = false;
    this.design = null;
    this.activeLevel = 0;
    this.brush = 'wall';
    this.activeTab = 'structure';
    this.voxelMaterial = 'concrete';
    this.voxelMode = 'place'; // 'place' | 'erase'

    this.dom.close.addEventListener('click', () => this.close());
    this.dom.showroomBtn.addEventListener('click', () => this.openShowroom());
    this.dom.newBtn.addEventListener('click', () => this.newDesign());
    this.dom.saveBtn.addEventListener('click', () => this.save());
    for (const btn of this.dom.tabButtons) {
      btn.addEventListener('click', () => {
        this.activeTab = btn.dataset.tab;
        for (const b of this.dom.tabButtons) b.classList.toggle('active', b === btn);
        this._renderTab();
        this._syncBuildPlane();
      });
    }
    // One shared click-vs-drag picker for the whole 3D viewport - which tab
    // is active decides whether a click resolves against the voxel layer
    // (Details) or the structure grid (Structure).
    this.picker = new FreeformClickPicker({
      canvas: this.dom.canvas,
      raycaster: (ndcX, ndcY) => this.activeTab === 'details'
        ? this.scene.raycastFromPointer(ndcX, ndcY)
        : this.scene.raycastStructure(ndcX, ndcY, this.activeLevel),
    });
    this.picker.onClick = (hit) => {
      if (this.activeTab === 'details') this._handleVoxelClick(hit);
      else this._handleStructureClick(hit);
    };
  }

  _handleVoxelClick(hit) {
    if (!hit || !hit.face) return;

    if (this.voxelMode === 'erase') {
      if (!hit.object.userData.isVoxel) return;
      const [x, y, z] = hit.object.userData.voxelKey.split(',').map(Number);
      if (!removeVoxelAt(this.design, x, y, z)) return;
    } else {
      const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      const target = hit.point.clone().addScaledVector(worldNormal, 0.25);
      const { x, y, z } = worldPointToVoxelCoord(target);
      if (y < 0) return; // never place below ground
      if (!addVoxel(this.design, x, y, z, this.voxelMaterial)) return;
    }
    this.scene.setDesign(this.design);
    if (this.activeTab === 'details') this._renderTab();
    this._renderStats();
  }

  // Structure tab's freeform placement: click an existing piece (resolved
  // directly via its userData tag) or click the active floor's pick plane
  // (resolved via worldPointToGridCell) to paint the current brush there -
  // the same "select a piece, click in the 3D world" flow as the voxel
  // layer, just snapped to the coarser structure grid instead of voxels.
  _handleStructureClick(hit) {
    if (!hit) return;
    const ud = hit.object.userData;
    let r, c;
    if (ud.isStructureCell) { ({ row: r, col: c } = ud); }
    else if (ud.isBuildPlane) { ({ r, c } = worldPointToGridCell(hit.point, structureGridOrigin(this.design), BUILD_CELL_SIZE)); }
    else return;
    if (r < 0 || c < 0 || r >= this.design.rows || c >= this.design.cols) return;
    const level = this.design.levels[this.activeLevel];
    if (level.grid[r][c] === this.brush) return;
    level.grid[r][c] = this.brush;
    this._drawGrid();
    this.scene.setDesign(this.design);
    this.scene.setActiveLevelPlane(this.design, this.activeLevel);
    this._renderStats();
  }

  open() {
    this.isOpen = true;
    this.dom.layer.classList.remove('hidden');
    if (!this.design) this.newDesign('small');
    else this._refreshAll();
    this.scene._resizeToContainer();
  }

  close() { this.isOpen = false; this.dom.layer.classList.add('hidden'); }

  newDesign(footprintId = 'small') {
    this.design = createDefaultBuildingDesign(footprintId);
    this.activeLevel = 0;
    this.activeTab = 'structure';
    for (const b of this.dom.tabButtons) b.classList.toggle('active', b.dataset.tab === 'structure');
    this._refreshAll();
  }

  loadForEdit(designId) {
    const src = this.catalog.get(designId);
    if (!src) return;
    this.design = JSON.parse(JSON.stringify(src));
    this.activeLevel = 0;
    this.open();
    this._refreshAll();
  }

  render(dtSeconds) { if (this.isOpen) this.scene.render(dtSeconds); }

  _refreshAll() {
    this.scene.setDesign(this.design);
    this._renderTab();
    this._renderStats();
    this._syncBuildPlane();
  }

  // Keeps the faint "you're building here" pick-plane in sync with which
  // tab/floor is active - shown only on the Structure tab (it doubles as
  // the raycast target for still-empty cells there), hidden everywhere else
  // so it doesn't visually clutter voxel decoration.
  _syncBuildPlane() {
    if (this.activeTab === 'structure') this.scene.setActiveLevelPlane(this.design, this.activeLevel);
    else this.scene.clearActiveLevelPlane();
  }

  _renderTab() {
    if (this.activeTab === 'details') this._tabDetails();
    else this._tabStructure();
  }

  _tabDetails() {
    const materialButtons = VOXEL_MATERIALS.map(m => `
      <button class="material-swatch ${this.voxelMaterial === m.id ? 'active' : ''}" data-voxel-material="${m.id}">
        <span class="swatch-dot" style="background:#${m.color.toString(16).padStart(6, '0')}"></span>${m.label}
      </button>
    `).join('');

    this.dom.tabContent.innerHTML = `
      <h4>Block Material</h4>
      <div class="material-swatch-row">${materialButtons}</div>
      <h4>Mode</h4>
      <div class="piece-brush-row">
        <button class="piece-brush ${this.voxelMode === 'place' ? 'active' : ''}" data-voxel-mode="place">🧱 Place</button>
        <button class="piece-brush ${this.voxelMode === 'erase' ? 'active' : ''}" data-voxel-mode="erase">⬛ Erase</button>
      </div>
      <p class="designer-hint">Click a surface on the 3D preview (right) to place a block flush against it, Minecraft-style. Switch to Erase and click an existing block to remove it. Drag to orbit as usual.</p>
    `;

    this.dom.tabContent.querySelectorAll('[data-voxel-material]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.voxelMaterial = btn.dataset.voxelMaterial;
        this._tabDetails();
      });
    });
    this.dom.tabContent.querySelectorAll('[data-voxel-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.voxelMode = btn.dataset.voxelMode;
        this._tabDetails();
      });
    });
  }

  _tabStructure() {
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

    const roofButtons = ROOF_MATERIALS.map(m => `
      <button class="material-swatch ${(design.roofMaterialId || 'shingle') === m.id ? 'active' : ''}" data-roof-material="${m.id}">
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
      <h4>Roof Material (whole building)</h4>
      <div class="material-swatch-row">${roofButtons}</div>
      <h4>Place</h4>
      <div class="piece-brush-row">${pieceButtons}</div>
      <canvas id="building-grid-canvas"></canvas>
      <p class="designer-hint">Click a spot on the 3D preview (right) to place the selected piece there, Bloxburg-style - click an existing piece to replace or (with Erase selected) remove it. Switch floors above to build upward. The canvas above is a top-down reference only.</p>
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
        this._syncBuildPlane();
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
    this.dom.tabContent.querySelectorAll('[data-roof-material]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.design.roofMaterialId = btn.dataset.roofMaterial;
        this._refreshAll();
      });
    });
    this.dom.tabContent.querySelectorAll('[data-piece]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.brush = btn.dataset.piece;
        this.dom.tabContent.querySelectorAll('[data-piece]').forEach(b => b.classList.toggle('active', b.dataset.piece === this.brush));
      });
    });

    this._drawGrid();
  }

  // Read-only top-down reference for the current floor - actual placement
  // happens via freeform 3D clicks (see _handleStructureClick), not by
  // painting on this canvas.
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
      garage_door: '#c8c8c0', arch: '#7a6a55', balcony: '#5a6a5a', chimney: '#6a4a3a', skylight: '#8fbccf',
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
      <div class="row"><span>Decoration blocks</span><b>${design.voxels.length}</b></div>
      ${doorCount === 0 ? '<div class="row violation">⚠️ No doors placed - add at least one entrance.</div>' : ''}
    `;
  }

  // ---------------- save / gallery ----------------

  save() {
    const nameInput = window.prompt('Name this building:', this.design.name);
    if (nameInput === null) return;
    this.design.name = nameInput || this.design.name;
    this.design.thumbnail = this.scene.snapshot();
    const saved = this.catalog.save(this.design);
    this.ui.showToast(`Saved "${saved.name}" to your building gallery.`);
  }

  openShowroom() {
    const designs = this.catalog.list();
    const cards = designs.map(d => `
      <div class="showroom-card">
        <img src="${d.thumbnail || ''}" class="showroom-thumb ${d.thumbnail ? '' : 'hidden'}">
        <div class="showroom-name">${d.name}</div>
        <div class="showroom-meta">${footprintPreset(d.footprintId).label} · ${d.levels.length} floor${d.levels.length === 1 ? '' : 's'} · ${d.voxels.length} blocks</div>
        <div class="showroom-actions">
          <button class="action secondary" data-edit="${d.id}">Edit</button>
          <button class="action secondary" data-clone="${d.id}">Clone</button>
          <button class="action secondary" data-export="${d.id}">Export</button>
          <button class="action danger" data-delete="${d.id}">Delete</button>
        </div>
      </div>`).join('') || '<p>No building designs yet - use "New" in the Building Creator to make one.</p>';

    this.ui.openModal('Building Gallery', `
      <div class="showroom-toolbar">
        <label class="action secondary" style="cursor:pointer">Import JSON<input type="file" id="building-showroom-import" accept=".json" class="hidden"></label>
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
    document.getElementById('building-showroom-import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try { await this.catalog.importFromFile(file); this.ui.showToast('Design imported.'); this.openShowroom(); }
      catch (err) { this.ui.showToast(err.message); }
    });
  }
}
