import { VEHICLE_TYPES, DEFAULT_REGULATION_ID } from '../config.js';
import { CHASSIS_DEFS, chassisById, chassisForCategory } from './chassisDefs.js';
import { powertrainsForCategory, powertrainById } from './powertrainDefs.js';
import { REGULATION_PRESETS, regulationById } from './regulations.js';
import { createDefaultModel, computeStats } from './vehicleModel.js';
import { InteriorEditor } from './interiorEditor.js';
import { DesignerScene } from './designerScene.js';

function fmtMoney(n) {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}
function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
function categoryLabel(cat) { return VEHICLE_TYPES[cat]?.label || cat; }

export class VehicleDesigner {
  constructor({ catalog, network, economy, ui }) {
    this.catalog = catalog;
    this.network = network;
    this.economy = economy;
    this.ui = ui;

    this.dom = {
      layer: document.getElementById('designer-layer'),
      tabButtons: [...document.querySelectorAll('.designer-tab')],
      tabContent: document.getElementById('designer-tab-content'),
      canvas: document.getElementById('designer-viewport'),
      envButtons: [...document.querySelectorAll('.designer-env-buttons button')],
      stats: document.getElementById('designer-stats'),
      close: document.getElementById('designer-close'),
      showroomBtn: document.getElementById('designer-showroom-btn'),
      newBtn: document.getElementById('designer-new-btn'),
      saveBtn: document.getElementById('designer-save-btn'),
    };

    this.scene = new DesignerScene(this.dom.canvas);
    this.activeTab = 'chassis';
    this.model = null;
    this.roiAssumption = { ridership: null, fare: economy.fare };
    this.isOpen = false;

    this._wireChrome();
  }

  _wireChrome() {
    this.dom.close.addEventListener('click', () => this.close());
    this.dom.showroomBtn.addEventListener('click', () => this.openShowroom());
    this.dom.newBtn.addEventListener('click', () => this.newDesign());
    this.dom.saveBtn.addEventListener('click', () => this.save());
    for (const btn of this.dom.tabButtons) {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    }
    for (const btn of this.dom.envButtons) {
      btn.addEventListener('click', () => {
        this.scene.setEnvironment(btn.dataset.env);
        for (const b of this.dom.envButtons) b.classList.toggle('active', b === btn);
      });
    }
  }

  open(chassisId) {
    this.isOpen = true;
    this.dom.layer.classList.remove('hidden');
    if (!this.model) this.newDesign(chassisId);
    else this._refreshAll();
    this.scene._resizeToContainer();
  }

  close() { this.isOpen = false; this.dom.layer.classList.add('hidden'); }

  newDesign(chassisId) {
    const firstUnlockedCategory = ['bus', 'tram', 'subway'].find(c => VEHICLE_TYPES[c].unlocked) || 'bus';
    const chassis = chassisId ? chassisById(chassisId) : chassisForCategory(firstUnlockedCategory)[0];
    this.model = createDefaultModel(chassis.id);
    this.switchTab('chassis');
    this._refreshAll();
  }

  loadForEdit(modelId) {
    const src = this.catalog.get(modelId);
    if (!src) return;
    this.model = JSON.parse(JSON.stringify(src));
    this.open();
    this.switchTab('chassis');
    this._refreshAll();
  }

  switchTab(tab) {
    this.activeTab = tab;
    for (const b of this.dom.tabButtons) b.classList.toggle('active', b.dataset.tab === tab);
    this._renderTab();
  }

  _chassis() { return chassisById(this.model.chassisId); }

  _stats() {
    return computeStats(this.model, {
      activeRegulationId: this.economy.activeRegulationId,
      fareAssumption: this.roiAssumption.fare,
      ridershipAssumption: this.roiAssumption.ridership,
    });
  }

  _refreshAll() {
    this.scene.setVehicle(this.model, this._chassis());
    this._renderTab();
    this._renderStats();
  }

  render(dtSeconds) { if (this.isOpen) this.scene.render(dtSeconds); }

  // ---------------- tabs ----------------

  _renderTab() {
    const fn = { chassis: this._tabChassis, interior: this._tabInterior, livery: this._tabLivery, regs: this._tabRegs }[this.activeTab];
    fn.call(this);
  }

  _tabChassis() {
    const cats = ['bus', 'tram', 'subway'];
    const sections = cats.map(cat => {
      const unlocked = VEHICLE_TYPES[cat].unlocked;
      const cards = chassisForCategory(cat).map(c => `
        <button class="chassis-card ${this.model.chassisId === c.id ? 'active' : ''}" data-chassis="${c.id}" ${unlocked ? '' : 'disabled'}>
          <div class="chassis-card-name">${c.name}</div>
          <div class="chassis-card-meta">${c.manufacturer} · ${c.gridCols}×${c.gridRows} · ${c.doorZones.length} door zones</div>
          <div class="chassis-card-meta">${fmtMoney(c.baseCostPerCar)}/car · ${c.baseSpeed} spd</div>
        </button>`).join('');
      return `<h4>${categoryLabel(cat)}${unlocked ? '' : ' 🔒 locked'}</h4><div class="chassis-card-row">${cards}</div>`;
    }).join('');

    const powertrains = powertrainsForCategory(this._chassis().category).map(p => `
      <button class="action ${this.model.powertrainId === p.id ? '' : 'secondary'}" data-powertrain="${p.id}">${p.label}</button>
    `).join('');

    this.dom.tabContent.innerHTML = `
      ${sections}
      <h4>Powertrain</h4>
      <div>${powertrains}</div>
    `;

    this.dom.tabContent.querySelectorAll('[data-chassis]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const newChassis = chassisById(btn.dataset.chassis);
        const sameCategory = newChassis.category === this._chassis().category;
        this.model.chassisId = newChassis.id;
        this.model.consistCars = Math.max(newChassis.minConsist, Math.min(newChassis.maxConsist, this.model.consistCars));
        this.model.aisleWidthCm = newChassis.defaultAisleWidthCm;
        this.model.stepHeightCm = newChassis.defaultStepHeightCm;
        this.model.doorZonesActive = newChassis.doorZones.map(() => true);
        this.model.floorPlan = createDefaultModel(newChassis.id).floorPlan;
        if (!sameCategory || !powertrainsForCategory(newChassis.category).some(p => p.id === this.model.powertrainId)) {
          this.model.powertrainId = powertrainsForCategory(newChassis.category)[0].id;
        }
        this._refreshAll();
      });
    });
    this.dom.tabContent.querySelectorAll('[data-powertrain]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.model.powertrainId = btn.dataset.powertrain;
        this._refreshAll();
      });
    });
  }

  _tabInterior() {
    this.dom.tabContent.innerHTML = `
      <div class="if-toolbar">
        <button class="if-brush active" data-brush="seat">💺 Seat</button>
        <button class="if-brush" data-brush="standing">🧍 Standing</button>
        <button class="if-brush" data-brush="wheelchair">♿ Wheelchair Bay</button>
        <button class="if-brush" data-brush="aisle">▫️ Aisle</button>
      </div>
      <div id="if-mount"></div>
      <div id="if-warning" class="if-warning hidden"></div>
      <p class="designer-hint">Click, or click-drag, to paint. The row of doors above the grid toggles which candidate door zones this chassis actually uses.</p>
    `;
    const mount = document.getElementById('if-mount');
    if (!this.interiorEditor) {
      this.interiorEditor = new InteriorEditor(mount, { onChange: () => this._renderStats() });
    } else {
      this.interiorEditor.container = mount;
    }
    this.interiorEditor.setModel(this.model, this._chassis());

    this.dom.tabContent.querySelectorAll('.if-brush').forEach(btn => {
      btn.addEventListener('click', () => {
        this.dom.tabContent.querySelectorAll('.if-brush').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.interiorEditor.setBrush(btn.dataset.brush);
      });
    });
  }

  _tabLivery() {
    const chassis = this._chassis();
    this.dom.tabContent.innerHTML = `
      <h4>Livery</h4>
      <div class="field"><label>Primary color</label><input type="color" id="livery-primary" value="${this.model.livery.primary}"></div>
      <div class="field"><label>Secondary / stripe color</label><input type="color" id="livery-secondary" value="${this.model.livery.secondary}"></div>
      <div class="field"><label>Pattern</label>
        <select id="livery-pattern">
          <option value="solid" ${this.model.livery.pattern === 'solid' ? 'selected' : ''}>Solid</option>
          <option value="stripe" ${this.model.livery.pattern === 'stripe' ? 'selected' : ''}>Stripe</option>
          <option value="twotone" ${this.model.livery.pattern === 'twotone' ? 'selected' : ''}>Two-tone</option>
          <option value="adwrap" ${this.model.livery.pattern === 'adwrap' ? 'selected' : ''}>Ad Wrap (sells ad space instead of a paint job)</option>
        </select>
      </div>
      <h4>Consist</h4>
      <div class="field"><label>Cars: ${this.model.consistCars} (${chassis.minConsist}-${chassis.maxConsist} allowed)</label>
        <input type="range" id="consist-slider" min="${chassis.minConsist}" max="${chassis.maxConsist}" value="${this.model.consistCars}"></div>
      <h4>Dimensions</h4>
      <div class="field"><label>Aisle width: ${this.model.aisleWidthCm}cm</label>
        <input type="range" id="aisle-slider" min="${chassis.minAisleWidthCm}" max="${chassis.maxAisleWidthCm}" value="${this.model.aisleWidthCm}"></div>
      <div class="field"><label>Step height: ${this.model.stepHeightCm}cm</label>
        <input type="range" id="step-slider" min="${chassis.minStepHeightCm}" max="${chassis.maxStepHeightCm}" value="${this.model.stepHeightCm}"></div>
    `;
    document.getElementById('livery-primary').addEventListener('input', (e) => { this.model.livery.primary = e.target.value; this.scene.setVehicle(this.model, chassis); this._renderStats(); });
    document.getElementById('livery-secondary').addEventListener('input', (e) => { this.model.livery.secondary = e.target.value; this.scene.setVehicle(this.model, chassis); this._renderStats(); });
    document.getElementById('livery-pattern').addEventListener('change', (e) => { this.model.livery.pattern = e.target.value; this.scene.setVehicle(this.model, chassis); this._renderStats(); });
    document.getElementById('consist-slider').addEventListener('change', (e) => { this.model.consistCars = Number(e.target.value); this.scene.setVehicle(this.model, chassis); this._tabLivery(); this._renderStats(); });
    document.getElementById('aisle-slider').addEventListener('input', (e) => { this.model.aisleWidthCm = Number(e.target.value); this._renderStats(); });
    document.getElementById('step-slider').addEventListener('input', (e) => { this.model.stepHeightCm = Number(e.target.value); this._renderStats(); });
  }

  _tabRegs() {
    const stats = this._stats();
    const rulesetButtons = REGULATION_PRESETS.map(r => `
      <button class="action ${this.economy.activeRegulationId === r.id ? '' : 'secondary'}" data-reg="${r.id}">${r.label}</button>
    `).join('');
    const violations = stats.compliance.violations.map(v => `<div class="row violation">⚠️ ${v}</div>`).join('');

    this.dom.tabContent.innerHTML = `
      <h4>City regulation (applies everywhere, not just this design)</h4>
      <div>${rulesetButtons}</div>
      <div class="row" style="margin-top:8px"><span>Compliance</span>
        <b style="color:${stats.compliance.compliant ? '#6ee7c9' : '#ff6b6b'}">${stats.compliance.compliant ? 'Compliant' : 'Non-compliant'}</b></div>
      ${violations}
      <h4>Cost / ROI assumptions</h4>
      <div class="field"><label>Assumed daily ridership: ${stats.assumedRidership}</label>
        <input type="range" id="roi-ridership" min="1" max="${Math.max(50, stats.capacityTotal * 8)}" value="${stats.assumedRidership}"></div>
      <div class="field"><label>Assumed fare: $${stats.assumedFare.toFixed(2)}</label>
        <input type="range" id="roi-fare" min="1" max="8" step="0.25" value="${stats.assumedFare}"></div>
      <div class="row"><span>Estimated payback period</span><b>${stats.paybackDays != null ? stats.paybackDays + ' days' : 'never (loses money)'}</b></div>
      <div class="row"><span>Running cost / passenger</span><b>${fmtMoney(stats.runningCostPerPassenger)}</b></div>
    `;
    this.dom.tabContent.querySelectorAll('[data-reg]').forEach(btn => {
      btn.addEventListener('click', () => { this.economy.activeRegulationId = btn.dataset.reg; this._tabRegs(); this._renderStats(); });
    });
    document.getElementById('roi-ridership').addEventListener('change', (e) => { this.roiAssumption.ridership = Number(e.target.value); this._tabRegs(); this._renderStats(); });
    document.getElementById('roi-fare').addEventListener('change', (e) => { this.roiAssumption.fare = Number(e.target.value); this._tabRegs(); this._renderStats(); });
  }

  // ---------------- stats readout ----------------

  _renderStats() {
    const s = this._stats();
    this.dom.stats.innerHTML = `
      <div class="row"><span>${s.manufacturer} · ${s.chassisName}</span><b>${s.powertrainLabel}</b></div>
      <div class="row"><span>Capacity</span><b>${s.capacityTotal} (${s.capacitySeatedPerCar}/car seated)</b></div>
      <div class="row"><span>Doors / Accessible bays</span><b>${s.doorCount} / ${s.accessibleBays}</b></div>
      <div class="row"><span>Purchase cost</span><b>${fmtMoney(s.purchaseCost)}</b></div>
      <div class="row"><span>Running cost/day</span><b>${fmtMoney(s.runningCostPerDay)}</b></div>
      ${s.adRevenuePerDay ? `<div class="row"><span>Ad revenue/day</span><b style="color:#6ee7c9">+${fmtMoney(s.adRevenuePerDay)}</b></div>` : ''}
      <div class="row"><span>Top speed</span><b>${s.topSpeed}</b></div>
      <div class="row"><span>Comfort</span><b>${s.comfortScore}</b></div>
      <div class="row"><span>Boarding speed</span><b>${s.boardingSpeedScore}</b></div>
      <div class="row"><span>Reliability</span><b>${s.reliabilityBase}</b></div>
      <div class="row"><span>Emissions</span><b>${s.emissionsScore}</b></div>
      <div class="row"><span>Compliance (${s.ruleset.label})</span><b style="color:${s.compliance.compliant ? '#6ee7c9' : '#ff6b6b'}">${s.compliance.compliant ? 'OK' : s.compliance.violations.length + ' issue(s)'}</b></div>
      ${!s.connected ? '<div class="row violation">⚠️ Interior has no clear front-to-back aisle path</div>' : ''}
    `;
  }

  // ---------------- save / showroom / comparison ----------------

  save() {
    const nameInput = window.prompt('Name this design:', this.model.name);
    if (nameInput === null) return;
    this.model.name = nameInput || this.model.name;
    this.model.thumbnail = this.scene.snapshot();
    const wasEdit = !!this.model.id;
    const saved = this.catalog.save(this.model);
    if (wasEdit) this._resyncLiveRoutes(saved.id);
    this.ui.showToast(`Saved "${saved.name}" to your catalog.`);
  }

  _resyncLiveRoutes(modelId) {
    const affected = this.network.resyncRoutesUsingModel(modelId, this.economy.activeRegulationId);
    for (const route of affected) this.ui.vehicleSystem.syncRouteVehicles(route);
    if (affected.length) this.network.refreshMeshes();
  }

  openShowroom() {
    const models = this.catalog.list();
    const cards = models.map(m => {
      const chassis = chassisById(m.chassisId);
      const stats = computeStats(m, { activeRegulationId: this.economy.activeRegulationId });
      return `
      <div class="showroom-card">
        <img src="${m.thumbnail || ''}" class="showroom-thumb ${m.thumbnail ? '' : 'hidden'}">
        <div class="showroom-name">${m.name}</div>
        <div class="showroom-meta">${categoryLabel(chassis.category)} · ${chassis.name} · ${stats.powertrainLabel}</div>
        <div class="showroom-meta">Cap ${stats.capacityTotal} · ${fmtMoney(stats.purchaseCost)} · ${stats.compliance.compliant ? '✅ compliant' : '⚠️ non-compliant'}</div>
        <div class="showroom-actions">
          <label><input type="checkbox" class="compare-check" data-id="${m.id}"> compare</label>
          <button class="action secondary" data-edit="${m.id}">Edit</button>
          <button class="action secondary" data-clone="${m.id}">Clone</button>
          <button class="action secondary" data-export="${m.id}">Export</button>
          <button class="action danger" data-delete="${m.id}">Delete</button>
        </div>
      </div>`;
    }).join('') || '<p>No designs yet - use "New" in the designer to create one.</p>';

    this.ui.openModal('Vehicle Showroom', `
      <div class="showroom-toolbar">
        <button class="action" id="showroom-compare">Compare Selected</button>
        <label class="action secondary" style="cursor:pointer">Import JSON<input type="file" id="showroom-import" accept=".json" class="hidden"></label>
      </div>
      <div class="showroom-grid">${cards}</div>
    `);

    const content = this.ui.dom.modalContent;
    content.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => { this.ui.closeModal(); this.loadForEdit(b.dataset.edit); }));
    content.querySelectorAll('[data-clone]').forEach(b => b.addEventListener('click', () => { this.catalog.clone(b.dataset.clone); this.openShowroom(); }));
    content.querySelectorAll('[data-export]').forEach(b => b.addEventListener('click', () => this.catalog.downloadExport(b.dataset.export)));
    content.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.delete;
      const inUse = [...this.network.routes.values()].some(r => r.modelId === id);
      if (inUse) { this.ui.showToast('Cannot delete - a route is currently using this design.'); return; }
      this.catalog.remove(id);
      this.openShowroom();
    }));
    document.getElementById('showroom-compare').addEventListener('click', () => {
      const ids = [...content.querySelectorAll('.compare-check:checked')].map(c => c.dataset.id).slice(0, 3);
      if (ids.length < 2) { this.ui.showToast('Select 2-3 designs to compare.'); return; }
      this.openComparison(ids);
    });
    document.getElementById('showroom-import').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try { await this.catalog.importFromFile(file); this.ui.showToast('Design imported.'); this.openShowroom(); }
      catch (err) { this.ui.showToast(err.message); }
    });
  }

  openComparison(ids) {
    const rows = [
      ['Capacity', s => s.capacityTotal, (a, b) => a > b],
      ['Purchase cost', s => s.purchaseCost, (a, b) => a < b],
      ['Running cost/day', s => s.runningCostPerDay, (a, b) => a < b],
      ['Top speed', s => s.topSpeed, (a, b) => a > b],
      ['Comfort', s => s.comfortScore, (a, b) => a > b],
      ['Boarding speed', s => s.boardingSpeedScore, (a, b) => a > b],
      ['Reliability', s => s.reliabilityBase, (a, b) => a > b],
      ['Emissions', s => s.emissionsScore, (a, b) => a < b],
      ['Est. payback (days)', s => s.paybackDays ?? Infinity, (a, b) => a < b],
    ];
    const models = ids.map(id => this.catalog.get(id)).filter(Boolean);
    const statsList = models.map(m => computeStats(m, { activeRegulationId: this.economy.activeRegulationId }));

    const header = `<tr><th>Stat</th>${models.map(m => `<th>${m.name}</th>`).join('')}</tr>`;
    const thumbRow = `<tr><td>Preview</td>${models.map(m => `<td>${m.thumbnail ? `<img src="${m.thumbnail}" class="compare-thumb">` : '—'}</td>`).join('')}</tr>`;
    const body = rows.map(([label, get, better]) => {
      const values = statsList.map(get);
      const bestVal = values.reduce((a, b) => (a === Infinity ? b : b === Infinity ? a : (better(a, b) ? a : b)));
      const cells = values.map(v => `<td class="${v === bestVal ? 'compare-best' : ''}">${v === Infinity ? 'never' : v}</td>`).join('');
      return `<tr><td>${label}</td>${cells}</tr>`;
    }).join('');

    this.ui.openModal('Compare Designs', `<table class="compare-table">${header}${thumbRow}${body}</table>`);
  }
}
