import { VEHICLE_TYPES, DEFAULT_REGULATION_ID, CARGO_TYPES } from '../config.js';
import { CHASSIS_DEFS, chassisById, chassisForCategory, effectiveChassis, maxDoorCountFor } from './chassisDefs.js';
import { FREIGHT_CHASSIS_DEFS, freightChassisById, freightChassisForCategory } from './freightChassisDefs.js';
import { powertrainsForCategory, powertrainById } from './powertrainDefs.js';
import { REGULATION_PRESETS, regulationById } from './regulations.js';
import { createDefaultModel, createDefaultFloorPlan, computeStats } from './vehicleModel.js';
import { createDefaultFreightModel, computeFreightStats } from './freightModel.js';
import { FEATURE_DEFS, MAX_PRIORITY_SEATS } from './featureDefs.js';
import { LIVERY_TEMPLATES, liveryTemplateById } from './liveryTemplates.js';
import {
  WHEEL_STYLES, HEADLIGHT_STYLES, ROOF_ACCESSORIES, WINDOW_TINTS, SEAT_MATERIALS, HORN_STYLES,
} from './vehicleStyleDefs.js';
import { InteriorEditor } from './interiorEditor.js';
import { DesignerScene } from './designerScene.js';
import { InteriorWalkController } from './interiorWalk.js';

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
      walkBtn: document.getElementById('designer-walk-btn'),
      walkHud: document.getElementById('designer-walk-hud'),
      walkExitBtn: document.getElementById('designer-walk-exit'),
    };

    this.scene = new DesignerScene(this.dom.canvas);
    this.interiorWalk = new InteriorWalkController({
      scene: this.scene,
      onExit: () => this.dom.walkHud.classList.add('hidden'),
    });
    this.activeTab = 'chassis';
    this.model = null;
    this.activeDeck = 0;
    this.roiAssumption = { ridership: null, fare: economy.fare };
    this._roiFreightShipments = null;
    this._roiFreightValuePerTon = null;
    this.isOpen = false;

    this._wireChrome();
  }

  _wireChrome() {
    this.dom.close.addEventListener('click', () => this.close());
    this.dom.showroomBtn.addEventListener('click', () => this.openShowroom());
    this.dom.newBtn.addEventListener('click', () => {
      if (this._isFreight()) this.openNewFreight();
      else this.newDesign();
    });
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
    this.dom.walkBtn.addEventListener('click', () => {
      this.interiorWalk.enter(this.model, this._chassis());
      this.dom.walkHud.classList.remove('hidden');
    });
    this.dom.walkExitBtn.addEventListener('click', () => this.interiorWalk.exit());
  }

  open(chassisId) {
    this.isOpen = true;
    this.dom.layer.classList.remove('hidden');
    if (!this.model) this.newDesign(chassisId);
    else this._refreshAll();
    this.scene._resizeToContainer();
  }

  close() {
    this.isOpen = false;
    this.dom.layer.classList.add('hidden');
    if (this.interiorWalk.active) this.interiorWalk.exit();
  }

  newDesign(chassisId) {
    if (this.interiorWalk.active) this.interiorWalk.exit();
    const firstUnlockedCategory = ['bus', 'tram', 'subway'].find(c => VEHICLE_TYPES[c].unlocked) || 'bus';
    const chassis = chassisId ? chassisById(chassisId) : chassisForCategory(firstUnlockedCategory)[0];
    this.model = createDefaultModel(chassis.id);
    this.activeDeck = 0;
    this.switchTab('chassis');
    this._refreshAll();
  }

  // Entry point for freight: always starts a fresh design (unlike open(),
  // which resumes whatever's in progress) since it's reached from a
  // dedicated "design a truck" action, not the general designer button.
  openNewFreight(chassisId) {
    if (this.interiorWalk.active) this.interiorWalk.exit();
    const chassis = chassisId ? freightChassisById(chassisId) : FREIGHT_CHASSIS_DEFS[0];
    this.model = createDefaultFreightModel(chassis.id);
    this.activeDeck = 0;
    this.isOpen = true;
    this.dom.layer.classList.remove('hidden');
    this.switchTab('chassis');
    this._refreshAll();
    this.scene._resizeToContainer();
  }

  loadForEdit(modelId) {
    if (this.interiorWalk.active) this.interiorWalk.exit();
    const src = this.catalog.get(modelId);
    if (!src) return;
    this.model = JSON.parse(JSON.stringify(src));
    this._normalizeModel();
    this.activeDeck = 0;
    this.open();
    this.switchTab('chassis');
    this._refreshAll();
  }

  // Designs saved before the Features tab / operator branding existed won't
  // have these fields - fill in safe defaults rather than special-casing
  // "undefined" everywhere they're read. Freight designs have no floor
  // plan/features/custom-dimension concepts at all, so they skip this.
  _normalizeModel() {
    if (this.model.livery.operatorName === undefined) this.model.livery.operatorName = '';
    if (this.model.livery.logoDataUrl === undefined) this.model.livery.logoDataUrl = null;
    if (this.model.kind === 'freight') return;
    if (this.model.livery.roof === undefined) this.model.livery.roof = '#2a2d33';
    if (this.model.livery.skirt === undefined) this.model.livery.skirt = '#1c1e22';
    if (!this.model.features) this.model.features = {};
    for (const f of FEATURE_DEFS) if (this.model.features[f.id] === undefined) this.model.features[f.id] = false;
    if (this.model.features.prioritySeats === undefined) this.model.features.prioritySeats = 0;
    const base = this._baseChassis();
    if (this.model.customLengthUnits === undefined) this.model.customLengthUnits = base.lengthUnits;
    if (this.model.customGridRows === undefined) this.model.customGridRows = base.gridRows;
    if (this.model.customDoorCount === undefined) this.model.customDoorCount = base.doorZones.length;
    if (this.model.deckCount === undefined) this.model.deckCount = 1;
    if (this.model.upperFloorPlan === undefined) this.model.upperFloorPlan = null;
    if (this.model.livery.windowTint === undefined) this.model.livery.windowTint = 'clear';
    if (this.model.livery.fleetNumber === undefined) this.model.livery.fleetNumber = '';
    if (!this.model.exterior) this.model.exterior = { wheelStyle: 'steel', headlightStyle: 'round', roofAccessory: 'none' };
    if (!this.model.interiorStyle) this.model.interiorStyle = { seatMaterial: 'fabric', seatColor: '#2f6690' };
    if (this.model.hornStyle === undefined) this.model.hornStyle = 'standard';
  }

  switchTab(tab) {
    // Freight designs have no floor plan or amenities - Interior/Features
    // are meaningless for them, so redirect to Chassis rather than render a
    // tab that assumes fields the model doesn't have.
    if (this._isFreight() && (tab === 'interior' || tab === 'features')) tab = 'chassis';
    this.activeTab = tab;
    for (const b of this.dom.tabButtons) b.classList.toggle('active', b.dataset.tab === tab);
    this._renderTab();
  }

  _isFreight() { return this.model?.kind === 'freight'; }

  // The base preset the model started from - used for category/manufacturer/
  // consist limits and the custom-dimension slider bounds, none of which
  // change with the player's length/width/door sliders.
  _baseChassis() { return this._isFreight() ? freightChassisById(this.model.chassisId) : chassisById(this.model.chassisId); }
  // The base preset with the player's custom length/width/door-count sliders
  // applied - this is "the chassis" everywhere stats/mesh/interior care about
  // actual physical size (see chassisDefs.js's effectiveChassis). Freight
  // chassis have no such sliders, so this is just the base preset for them.
  _chassis() { return this._isFreight() ? freightChassisById(this.model.chassisId) : effectiveChassis(this.model); }

  _stats() {
    if (this._isFreight()) {
      return computeFreightStats(this.model, {
        shipmentsPerDayAssumption: this._roiFreightShipments,
        valuePerTonAssumption: this._roiFreightValuePerTon,
      });
    }
    return computeStats(this.model, {
      activeRegulationId: this.economy.activeRegulationId,
      fareAssumption: this.roiAssumption.fare,
      ridershipAssumption: this.roiAssumption.ridership,
    });
  }

  // Interior/Features only make sense for passenger designs; Walk Interior
  // needs an actual floor plan to walk around in.
  _updateChromeForKind() {
    const freight = this._isFreight();
    for (const b of this.dom.tabButtons) {
      if (b.dataset.tab === 'interior' || b.dataset.tab === 'features') b.classList.toggle('hidden', freight);
    }
    this.dom.walkBtn.classList.toggle('hidden', freight);
  }

  _refreshAll() {
    this._updateChromeForKind();
    this.scene.setVehicle(this.model, this._chassis());
    this._renderTab();
    this._renderStats();
  }

  render(dtSeconds) {
    if (!this.isOpen) return;
    if (this.interiorWalk.active) this.interiorWalk.update(dtSeconds);
    this.scene.render(dtSeconds);
  }

  // ---------------- tabs ----------------

  _renderTab() {
    if (this._isFreight()) {
      const fn = { chassis: this._tabChassisFreight, livery: this._tabLiveryFreight, regs: this._tabRegsFreight }[this.activeTab] || this._tabChassisFreight;
      fn.call(this);
      return;
    }
    const fn = {
      chassis: this._tabChassis, interior: this._tabInterior, livery: this._tabLivery,
      features: this._tabFeatures, regs: this._tabRegs,
    }[this.activeTab];
    fn.call(this);
  }

  // ---------------- freight tabs ----------------

  _tabChassisFreight() {
    const cats = ['truck', 'freight_rail'];
    const catLabel = { truck: 'Truck', freight_rail: 'Freight Rail' };
    const sections = cats.map(cat => {
      const cards = freightChassisForCategory(cat).map(c => `
        <button class="chassis-card ${this.model.chassisId === c.id ? 'active' : ''}" data-freight-chassis="${c.id}">
          <div class="chassis-card-name">${c.name}</div>
          <div class="chassis-card-meta">${c.manufacturer} · ${c.cargoCapacityTons}t · ${c.compatibleCargo.map(id => CARGO_TYPES[id]?.icon).join(' ')}</div>
          <div class="chassis-card-meta">${fmtMoney(c.baseCostPerCar)}/car · ${c.baseSpeed} spd</div>
        </button>`).join('');
      return `<h4>${catLabel[cat]}</h4><div class="chassis-card-row">${cards}</div>`;
    }).join('');

    const chassis = this._chassis();
    const powertrains = powertrainsForCategory(chassis.category).map(p => `
      <button class="action ${this.model.powertrainId === p.id ? '' : 'secondary'}" data-powertrain="${p.id}">${p.label}</button>
    `).join('');

    this.dom.tabContent.innerHTML = `
      ${sections}
      <h4>Powertrain</h4>
      <div>${powertrains}</div>
      <p class="designer-hint">Freight chassis carry a fixed cargo type mix and body style - pick the family that matches what you plan to haul.</p>
    `;

    this.dom.tabContent.querySelectorAll('[data-freight-chassis]').forEach(btn => {
      btn.addEventListener('click', () => {
        const newChassis = freightChassisById(btn.dataset.freightChassis);
        const sameCategory = newChassis.category === this._chassis().category;
        this.model.chassisId = newChassis.id;
        this.model.consistCars = Math.max(newChassis.minConsist, Math.min(newChassis.maxConsist, this.model.consistCars));
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

  _tabLiveryFreight() {
    const chassis = this._chassis();
    this.dom.tabContent.innerHTML = `
      <h4>Brand Templates</h4>
      ${this._liveryTemplateRow()}
      <h4>Livery</h4>
      <div class="field"><label>Primary color</label><input type="color" id="livery-primary" value="${this.model.livery.primary}"></div>
      <div class="field"><label>Secondary / stripe color</label><input type="color" id="livery-secondary" value="${this.model.livery.secondary}"></div>
      <div class="field"><label>Operator name (shown on the side of the vehicle)</label>
        <input type="text" id="livery-operator" maxlength="24" placeholder="${chassis.manufacturer}" value="${this.model.livery.operatorName || ''}"></div>
      ${this._logoUploadRow()}
      <h4>Consist</h4>
      <div class="field"><label>Cars: ${this.model.consistCars} (${chassis.minConsist}-${chassis.maxConsist} allowed)</label>
        <input type="range" id="consist-slider" min="${chassis.minConsist}" max="${chassis.maxConsist}" value="${this.model.consistCars}"></div>
    `;
    document.getElementById('livery-primary').addEventListener('input', (e) => { this.model.livery.primary = e.target.value; this.scene.setVehicle(this.model, chassis); this._renderStats(); });
    document.getElementById('livery-secondary').addEventListener('input', (e) => { this.model.livery.secondary = e.target.value; this.scene.setVehicle(this.model, chassis); this._renderStats(); });
    document.getElementById('livery-operator').addEventListener('input', (e) => { this.model.livery.operatorName = e.target.value; this.scene.setVehicle(this.model, chassis); });
    document.getElementById('consist-slider').addEventListener('change', (e) => { this.model.consistCars = Number(e.target.value); this.scene.setVehicle(this.model, chassis); this._tabLiveryFreight(); this._renderStats(); });
    this._wireLiveryShared(chassis, this._tabLiveryFreight);
  }

  _tabRegsFreight() {
    const stats = this._stats();
    this.dom.tabContent.innerHTML = `
      <h4>Cost / ROI assumptions</h4>
      <div class="field"><label>Assumed shipments/day: ${stats.assumedShipmentsPerDay}</label>
        <input type="range" id="roi-shipments" min="1" max="${Math.max(10, stats.assumedShipmentsPerDay * 4)}" value="${stats.assumedShipmentsPerDay}"></div>
      <div class="field"><label>Assumed value/ton: ${fmtMoney(stats.assumedValuePerTon)}</label>
        <input type="range" id="roi-valuepertons" min="5" max="100" step="5" value="${stats.assumedValuePerTon}"></div>
      <div class="row"><span>Estimated payback period</span><b>${stats.paybackDays != null ? stats.paybackDays + ' days' : 'never (loses money)'}</b></div>
    `;
    document.getElementById('roi-shipments').addEventListener('change', (e) => {
      this._roiFreightShipments = Number(e.target.value);
      this._tabRegsFreight();
      this._renderStats();
    });
    document.getElementById('roi-valuepertons').addEventListener('change', (e) => {
      this._roiFreightValuePerTon = Number(e.target.value);
      this._tabRegsFreight();
      this._renderStats();
    });
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

    const base = this._baseChassis();
    const eff = this._chassis();
    const powertrains = powertrainsForCategory(eff.category).map(p => `
      <button class="action ${this.model.powertrainId === p.id ? '' : 'secondary'}" data-powertrain="${p.id}">${p.label}</button>
    `).join('');

    this.dom.tabContent.innerHTML = `
      ${sections}
      <h4>Powertrain</h4>
      <div>${powertrains}</div>
      <h4>Custom Dimensions</h4>
      <div class="field"><label>Length: ${eff.lengthUnits}m (${base.minLengthUnits}-${base.maxLengthUnits}m)</label>
        <input type="range" id="length-slider" min="${base.minLengthUnits}" max="${base.maxLengthUnits}" value="${eff.lengthUnits}"></div>
      <div class="field"><label>Width (rows): ${eff.gridRows} (${base.minGridRows}-${base.maxGridRows})</label>
        <input type="range" id="rows-slider" min="${base.minGridRows}" max="${base.maxGridRows}" value="${eff.gridRows}"></div>
      <div class="field"><label>Doors: ${eff.doorZones.length} (1-${maxDoorCountFor(eff.lengthUnits)})</label>
        <input type="range" id="doors-slider" min="1" max="${maxDoorCountFor(eff.lengthUnits)}" value="${eff.doorZones.length}"></div>
      <p class="designer-hint">Bigger vehicles cost and run for more but carry proportionally more passengers - resizing regenerates the floor plan, so repaint seats/aisles afterward.</p>
      ${base.maxDecks >= 2 ? `
        <h4>Decks</h4>
        <div class="chassis-card-row">
          <button class="action ${this.model.deckCount === 1 ? '' : 'secondary'}" data-decks="1">Single Deck</button>
          <button class="action ${this.model.deckCount === 2 ? '' : 'secondary'}" data-decks="2">Double Decker</button>
        </div>
        <p class="designer-hint">A double-decker needs a staircase cell on each deck (paint one in the Interior tab) to connect the two levels.</p>
      ` : ''}
      <h4>Wheels</h4>
      <div class="chassis-card-row">${WHEEL_STYLES.map(w => `
        <button class="action ${this.model.exterior.wheelStyle === w.id ? '' : 'secondary'}" data-wheel-style="${w.id}">
          ${w.label}<br><small>${w.costPerCar ? fmtMoney(w.costPerCar) + '/car' : 'included'}</small>
        </button>`).join('')}</div>
      <h4>Headlights</h4>
      <div class="chassis-card-row">${HEADLIGHT_STYLES.map(h => `
        <button class="action ${this.model.exterior.headlightStyle === h.id ? '' : 'secondary'}" data-headlight-style="${h.id}">
          ${h.label}<br><small>${h.costPerCar ? fmtMoney(h.costPerCar) + '/car' : 'included'}</small>
        </button>`).join('')}</div>
      <h4>Roof Accessory</h4>
      <div class="chassis-card-row">${ROOF_ACCESSORIES.map(r => `
        <button class="action ${this.model.exterior.roofAccessory === r.id ? '' : 'secondary'}" data-roof-accessory="${r.id}">
          ${r.label}<br><small>${r.costPerCar ? fmtMoney(r.costPerCar) + '/car' : 'included'}</small>
        </button>`).join('')}</div>
      <p class="designer-hint">Roof Luggage Rack only shows up on bus chassis; Scissor Pantograph only replaces the default single-arm pantograph on electric trams/subways - picking one that doesn't apply to this chassis just has no visual effect.</p>
    `;

    this.dom.tabContent.querySelectorAll('[data-chassis]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        if (this.interiorWalk.active) this.interiorWalk.exit();
        const newChassis = chassisById(btn.dataset.chassis);
        const sameCategory = newChassis.category === this._chassis().category;
        this.model.chassisId = newChassis.id;
        this.model.consistCars = Math.max(newChassis.minConsist, Math.min(newChassis.maxConsist, this.model.consistCars));
        this.model.customLengthUnits = newChassis.lengthUnits;
        this.model.customGridRows = newChassis.gridRows;
        this.model.customDoorCount = newChassis.doorZones.length;
        this.model.aisleWidthCm = newChassis.defaultAisleWidthCm;
        this.model.stepHeightCm = newChassis.defaultStepHeightCm;
        this.model.doorZonesActive = newChassis.doorZones.map(() => true);
        this.model.floorPlan = createDefaultModel(newChassis.id).floorPlan;
        this.model.deckCount = 1;
        this.model.upperFloorPlan = null;
        this.activeDeck = 0;
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
    document.getElementById('length-slider').addEventListener('change', (e) => {
      this.model.customLengthUnits = Number(e.target.value);
      this._regenerateFloorPlanForCustomSize();
      this._refreshAll();
    });
    document.getElementById('rows-slider').addEventListener('change', (e) => {
      this.model.customGridRows = Number(e.target.value);
      this._regenerateFloorPlanForCustomSize();
      this._refreshAll();
    });
    document.getElementById('doors-slider').addEventListener('change', (e) => {
      this.model.customDoorCount = Number(e.target.value);
      this._regenerateFloorPlanForCustomSize();
      this._refreshAll();
    });
    this.dom.tabContent.querySelectorAll('[data-decks]').forEach(btn => {
      btn.addEventListener('click', () => {
        const decks = Number(btn.dataset.decks);
        if (decks === this.model.deckCount) return;
        if (this.interiorWalk.active) this.interiorWalk.exit();
        this.model.deckCount = decks;
        this.model.upperFloorPlan = decks === 2 ? createDefaultFloorPlan(this._chassis()) : null;
        this.activeDeck = 0;
        this._refreshAll();
      });
    });
    this.dom.tabContent.querySelectorAll('[data-wheel-style]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.model.exterior.wheelStyle = btn.dataset.wheelStyle;
        this.scene.setVehicle(this.model, this._chassis());
        this._tabChassis();
        this._renderStats();
      });
    });
    this.dom.tabContent.querySelectorAll('[data-headlight-style]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.model.exterior.headlightStyle = btn.dataset.headlightStyle;
        this.scene.setVehicle(this.model, this._chassis());
        this._tabChassis();
        this._renderStats();
      });
    });
    this.dom.tabContent.querySelectorAll('[data-roof-accessory]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.model.exterior.roofAccessory = btn.dataset.roofAccessory;
        this.scene.setVehicle(this.model, this._chassis());
        this._tabChassis();
        this._renderStats();
      });
    });
  }

  // Length/width/door-count changes resize the floor plan grid itself, so
  // any previously-painted seats/aisles can't carry over meaningfully - the
  // same "start fresh" tradeoff switching chassis entirely already has.
  // Also exits walk mode if active - it caches the chassis dimensions it
  // entered with, which a resize would otherwise silently invalidate.
  _regenerateFloorPlanForCustomSize() {
    if (this.interiorWalk.active) this.interiorWalk.exit();
    const eff = this._chassis();
    this.model.floorPlan = createDefaultFloorPlan(eff);
    this.model.doorZonesActive = eff.doorZones.map(() => true);
  }

  _tabInterior() {
    const isDoubleDecker = this.model.deckCount === 2 && !!this.model.upperFloorPlan;
    const deckTabs = isDoubleDecker ? `
      <div class="chassis-card-row">
        <button class="action ${this.activeDeck === 0 ? '' : 'secondary'}" data-deck="0">Lower Deck</button>
        <button class="action ${this.activeDeck === 1 ? '' : 'secondary'}" data-deck="1">Upper Deck</button>
      </div>
    ` : '';

    this.dom.tabContent.innerHTML = `
      ${deckTabs}
      <div class="if-toolbar">
        <button class="if-brush active" data-brush="seat">💺 Seat</button>
        <button class="if-brush" data-brush="standing">🧍 Standing</button>
        <button class="if-brush" data-brush="wheelchair">♿ Wheelchair Bay</button>
        <button class="if-brush" data-brush="luggage">🧳 Luggage Rack</button>
        ${isDoubleDecker ? '<button class="if-brush" data-brush="stairs">🪜 Stairs</button>' : ''}
        <button class="if-brush" data-brush="aisle">▫️ Aisle</button>
      </div>
      <div id="if-mount"></div>
      <div id="if-warning" class="if-warning hidden"></div>
      <p class="designer-hint">Click, or click-drag, to paint. The row of doors above the grid toggles which candidate door zones this chassis actually uses.</p>
      <h4>Seat Trim</h4>
      <div class="chassis-card-row">${SEAT_MATERIALS.map(s => `
        <button class="action ${this.model.interiorStyle.seatMaterial === s.id ? '' : 'secondary'}" data-seat-material="${s.id}">
          ${s.label}<br><small>${s.costPerCar ? fmtMoney(s.costPerCar) + '/car' : 'included'}</small>
        </button>`).join('')}</div>
      <div class="field"><label>Seat color</label><input type="color" id="seat-color" value="${this.model.interiorStyle.seatColor}"></div>
    `;
    const mount = document.getElementById('if-mount');
    if (!this.interiorEditor) {
      this.interiorEditor = new InteriorEditor(mount, { onChange: () => this._renderStats() });
    } else {
      this.interiorEditor.container = mount;
    }
    this.interiorEditor.setModel(this.model, this._chassis(), this.activeDeck);

    this.dom.tabContent.querySelectorAll('[data-seat-material]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.model.interiorStyle.seatMaterial = btn.dataset.seatMaterial;
        this._tabInterior();
        this._renderStats();
      });
    });
    document.getElementById('seat-color').addEventListener('input', (e) => {
      this.model.interiorStyle.seatColor = e.target.value;
    });

    this.dom.tabContent.querySelectorAll('.if-brush').forEach(btn => {
      btn.addEventListener('click', () => {
        this.dom.tabContent.querySelectorAll('.if-brush').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.interiorEditor.setBrush(btn.dataset.brush);
      });
    });
    this.dom.tabContent.querySelectorAll('[data-deck]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeDeck = Number(btn.dataset.deck);
        this._tabInterior();
      });
    });
  }

  // ---------------- livery authoring (shared passenger + freight) ----------------

  // One-click brand color schemes - see liveryTemplates.js. Shared between
  // both livery tabs since the concept (and swatch styling, reusing the
  // Building Creator's .material-swatch look) is identical either way.
  _liveryTemplateRow() {
    return `<div class="material-swatch-row">${LIVERY_TEMPLATES.map(t => `
      <button class="material-swatch" data-template="${t.id}" title="${t.name}">
        <span class="swatch-dot" style="background:${t.primary}"></span>${t.name}
      </button>`).join('')}</div>`;
  }

  _logoUploadRow() {
    const has = !!this.model.livery.logoDataUrl;
    return `
      <div class="field"><label>Logo decal (shown on both sides)</label>
        <div class="piece-brush-row">
          <label class="action secondary" style="cursor:pointer">Upload Image<input type="file" id="livery-logo" accept="image/*" class="hidden"></label>
          ${has ? '<button class="action secondary" id="livery-logo-remove">Remove Logo</button>' : ''}
        </div>
      </div>
    `;
  }

  // Wires the template swatches + logo upload/remove controls that both
  // livery tabs render - rerender is the tab's own render function, called
  // to refresh the "Remove Logo" button's visibility after a change.
  _wireLiveryShared(chassis, rerender) {
    this.dom.tabContent.querySelectorAll('[data-template]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = liveryTemplateById(btn.dataset.template);
        this.model.livery.primary = t.primary;
        this.model.livery.secondary = t.secondary;
        this.model.livery.pattern = t.pattern;
        if (!this._isFreight()) { this.model.livery.roof = t.roof; this.model.livery.skirt = t.skirt; }
        this.scene.setVehicle(this.model, chassis);
        rerender.call(this);
        this._renderStats();
      });
    });
    this.dom.tabContent.querySelector('#livery-logo')?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        this.model.livery.logoDataUrl = String(reader.result);
        this.scene.setVehicle(this.model, chassis);
        rerender.call(this);
      };
      reader.readAsDataURL(file);
    });
    this.dom.tabContent.querySelector('#livery-logo-remove')?.addEventListener('click', () => {
      this.model.livery.logoDataUrl = null;
      this.scene.setVehicle(this.model, chassis);
      rerender.call(this);
    });
  }

  _tabLivery() {
    const chassis = this._chassis();
    this.dom.tabContent.innerHTML = `
      <h4>Brand Templates</h4>
      ${this._liveryTemplateRow()}
      <h4>Livery</h4>
      <div class="field"><label>Primary (body) color</label><input type="color" id="livery-primary" value="${this.model.livery.primary}"></div>
      <div class="field"><label>Secondary / stripe color</label><input type="color" id="livery-secondary" value="${this.model.livery.secondary}"></div>
      <div class="field"><label>Roof / trim color</label><input type="color" id="livery-roof" value="${this.model.livery.roof ?? '#2a2d33'}"></div>
      <div class="field"><label>Skirt color</label><input type="color" id="livery-skirt" value="${this.model.livery.skirt ?? '#1c1e22'}"></div>
      <div class="field"><label>Pattern</label>
        <select id="livery-pattern">
          <option value="solid" ${this.model.livery.pattern === 'solid' ? 'selected' : ''}>Solid</option>
          <option value="stripe" ${this.model.livery.pattern === 'stripe' ? 'selected' : ''}>Stripe</option>
          <option value="twotone" ${this.model.livery.pattern === 'twotone' ? 'selected' : ''}>Two-tone</option>
          <option value="adwrap" ${this.model.livery.pattern === 'adwrap' ? 'selected' : ''}>Ad Wrap (sells ad space instead of a paint job)</option>
        </select>
      </div>
      <div class="field"><label>Operator name (shown on the destination board)</label>
        <input type="text" id="livery-operator" maxlength="24" placeholder="${this.model.name}" value="${this.model.livery.operatorName || ''}"></div>
      <div class="field"><label>Fleet / unit number (shown on a small side plate)</label>
        <input type="text" id="livery-fleet-number" maxlength="6" placeholder="e.g. 101" value="${this.model.livery.fleetNumber || ''}"></div>
      ${this._logoUploadRow()}
      <h4>Window Tint</h4>
      <div class="chassis-card-row">${WINDOW_TINTS.map(t => `
        <button class="action ${this.model.livery.windowTint === t.id ? '' : 'secondary'}" data-window-tint="${t.id}">
          ${t.label}<br><small>${t.costPerCar ? fmtMoney(t.costPerCar) + '/car' : 'included'}</small>
        </button>`).join('')}</div>
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
    document.getElementById('livery-roof').addEventListener('input', (e) => { this.model.livery.roof = e.target.value; this.scene.setVehicle(this.model, chassis); });
    document.getElementById('livery-skirt').addEventListener('input', (e) => { this.model.livery.skirt = e.target.value; this.scene.setVehicle(this.model, chassis); });
    document.getElementById('livery-pattern').addEventListener('change', (e) => { this.model.livery.pattern = e.target.value; this.scene.setVehicle(this.model, chassis); this._renderStats(); });
    document.getElementById('livery-operator').addEventListener('input', (e) => { this.model.livery.operatorName = e.target.value; this.scene.setVehicle(this.model, chassis); });
    document.getElementById('livery-fleet-number').addEventListener('input', (e) => { this.model.livery.fleetNumber = e.target.value; this.scene.setVehicle(this.model, chassis); });
    this.dom.tabContent.querySelectorAll('[data-window-tint]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.model.livery.windowTint = btn.dataset.windowTint;
        this.scene.setVehicle(this.model, chassis);
        this._tabLivery();
        this._renderStats();
      });
    });
    document.getElementById('consist-slider').addEventListener('change', (e) => { this.model.consistCars = Number(e.target.value); this.scene.setVehicle(this.model, chassis); this._tabLivery(); this._renderStats(); });
    document.getElementById('aisle-slider').addEventListener('input', (e) => { this.model.aisleWidthCm = Number(e.target.value); this._renderStats(); });
    document.getElementById('step-slider').addEventListener('input', (e) => { this.model.stepHeightCm = Number(e.target.value); this._renderStats(); });
    this._wireLiveryShared(chassis, this._tabLivery);
  }

  _tabFeatures() {
    const chassis = this._chassis();
    const seatCount = this.model.floorPlan.flat().filter(c => c === 'seat').length;
    const maxPriority = Math.min(MAX_PRIORITY_SEATS, seatCount);
    const featureButtons = FEATURE_DEFS.map(f => {
      const active = !!this.model.features[f.id];
      return `<button class="action ${active ? '' : 'secondary'}" data-feature="${f.id}">
        ${f.icon} ${f.label}<br><small>${fmtMoney(f.costPerCar)}/car + ${fmtMoney(f.runningCostPerDayPerCar)}/day/car</small>
      </button>`;
    }).join('');

    const hornButtons = HORN_STYLES.map(h => `
      <button class="action ${this.model.hornStyle === h.id ? '' : 'secondary'}" data-horn-style="${h.id}">${h.label}</button>
    `).join('');

    this.dom.tabContent.innerHTML = `
      <h4>Onboard amenities</h4>
      <div class="chassis-card-row">${featureButtons}</div>
      <h4>Priority seating</h4>
      <div class="field"><label>Reserved seats: ${this.model.features.prioritySeats || 0} (of ${seatCount} seats)</label>
        <input type="range" id="priority-slider" min="0" max="${maxPriority}" value="${Math.min(this.model.features.prioritySeats || 0, maxPriority)}"></div>
      <p class="designer-hint">Amenities add to purchase price and daily running cost but boost comfort (and a little reliability for CCTV). Priority seats are a designation on existing seats, not new equipment - free, but capped by how many seats you've actually painted.</p>
      <h4>Arrival Horn / Chime</h4>
      <div class="chassis-card-row">${hornButtons}</div>
      <p class="designer-hint">Purely an audio cue - no effect on stats. Plays when this vehicle arrives at a station in-sim.</p>
    `;
    this.dom.tabContent.querySelectorAll('[data-horn-style]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.model.hornStyle = btn.dataset.hornStyle;
        this._tabFeatures();
      });
    });
    this.dom.tabContent.querySelectorAll('[data-feature]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.feature;
        this.model.features[id] = !this.model.features[id];
        this.scene.setVehicle(this.model, chassis);
        this._tabFeatures();
        this._renderStats();
      });
    });
    document.getElementById('priority-slider').addEventListener('input', (e) => {
      this.model.features.prioritySeats = Number(e.target.value);
      this._renderStats();
    });
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
    if (this._isFreight()) {
      this.dom.stats.innerHTML = `
        <div class="row"><span>${s.manufacturer} · ${s.chassisName}</span><b>${s.powertrainLabel}</b></div>
        <div class="row"><span>Cargo capacity</span><b>${s.capacityTonsTotal}t (${s.capacityTonsPerCar}t/car)</b></div>
        <div class="row"><span>Carries</span><b>${s.compatibleCargo.map(id => CARGO_TYPES[id]?.icon).join(' ')}</b></div>
        <div class="row"><span>Purchase cost</span><b>${fmtMoney(s.purchaseCost)}</b></div>
        <div class="row"><span>Running cost/day</span><b>${fmtMoney(s.runningCostPerDay)}</b></div>
        <div class="row"><span>Top speed</span><b>${s.topSpeed}</b></div>
        <div class="row"><span>Reliability</span><b>${s.reliabilityBase}</b></div>
        <div class="row"><span>Emissions</span><b>${s.emissionsScore}</b></div>
        <div class="row"><span>Est. payback period</span><b>${s.paybackDays != null ? s.paybackDays + ' days' : 'never (loses money)'}</b></div>
      `;
      return;
    }
    this.dom.stats.innerHTML = `
      <div class="row"><span>${s.manufacturer} · ${s.chassisName}</span><b>${s.powertrainLabel}</b></div>
      <div class="row"><span>Capacity</span><b>${s.capacityTotal} (${s.capacitySeatedPerCar}/car seated)</b></div>
      <div class="row"><span>Doors / Accessible bays</span><b>${s.doorCount} / ${s.accessibleBays}</b></div>
      <div class="row"><span>Purchase cost</span><b>${fmtMoney(s.purchaseCost)}</b></div>
      <div class="row"><span>Running cost/day</span><b>${fmtMoney(s.runningCostPerDay)}</b></div>
      ${s.adRevenuePerDay ? `<div class="row"><span>Ad revenue/day</span><b style="color:#6ee7c9">+${fmtMoney(s.adRevenuePerDay)}</b></div>` : ''}
      ${s.activeFeatures.length ? `<div class="row"><span>Amenities</span><b>${s.activeFeatures.map(f => f.icon).join(' ')} (${fmtMoney(s.featureCostPerCar)}/car)</b></div>` : ''}
      ${s.prioritySeats ? `<div class="row"><span>Priority seats</span><b>${s.prioritySeats}</b></div>` : ''}
      <div class="row"><span>Top speed</span><b>${s.topSpeed}</b></div>
      <div class="row"><span>Comfort</span><b>${s.comfortScore}</b></div>
      <div class="row"><span>Boarding speed</span><b>${s.boardingSpeedScore}</b></div>
      <div class="row"><span>Reliability</span><b>${s.reliabilityBase}</b></div>
      <div class="row"><span>Emissions</span><b>${s.emissionsScore}</b></div>
      <div class="row"><span>Compliance (${s.ruleset.label})</span><b style="color:${s.compliance.compliant ? '#6ee7c9' : '#ff6b6b'}">${s.compliance.compliant ? 'OK' : s.compliance.violations.length + ' issue(s)'}</b></div>
      ${!s.connected ? '<div class="row violation">⚠️ Interior has no clear front-to-back aisle path</div>' : ''}
      ${s.isDoubleDecker && !s.stairsConnected ? '<div class="row violation">⚠️ Add a staircase cell on both decks to connect them</div>' : ''}
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
      if (m.kind === 'freight') {
        const chassis = freightChassisById(m.chassisId);
        const stats = computeFreightStats(m, {});
        return `
        <div class="showroom-card">
          <img src="${m.thumbnail || ''}" class="showroom-thumb ${m.thumbnail ? '' : 'hidden'}">
          <div class="showroom-name">${m.name}</div>
          <div class="showroom-meta">Freight · ${chassis.name} · ${stats.powertrainLabel}</div>
          <div class="showroom-meta">${stats.capacityTonsTotal}t · ${fmtMoney(stats.purchaseCost)} · ${stats.compatibleCargo.map(id => CARGO_TYPES[id]?.icon).join(' ')}</div>
          <div class="showroom-actions">
            <button class="action secondary" data-edit="${m.id}">Edit</button>
            <button class="action secondary" data-clone="${m.id}">Clone</button>
            <button class="action secondary" data-export="${m.id}">Export</button>
            <button class="action danger" data-delete="${m.id}">Delete</button>
          </div>
        </div>`;
      }
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
      const inUseByRoute = [...this.network.routes.values()].some(r => r.modelId === id);
      const inUseByDepot = [...(this.ui.cargoSystem?.depots.values() || [])].some(d => d.modelId === id);
      if (inUseByRoute) { this.ui.showToast('Cannot delete - a route is currently using this design.'); return; }
      if (inUseByDepot) { this.ui.showToast('Cannot delete - a depot is currently using this design.'); return; }
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
