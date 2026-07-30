import * as THREE from 'three';
import { STATION_COST, VEHICLE_TYPES, CARGO_DEPOT_COST, CARGO_TYPES } from './config.js';
import { REGULATION_PRESETS } from './designer/regulations.js';
import { FREIGHT_CHASSIS_DEFS, freightChassisById } from './designer/freightChassisDefs.js';
import { createDefaultFreightModel, computeFreightStats } from './designer/freightModel.js';

function fmtMoney(n) {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}

function el(html) {
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  return div.firstElementChild;
}

export class UIController {
  constructor({ sceneManager, city, network, vehicleSystem, passengerSystem, economy, timeSystem, catalog }) {
    this.sceneManager = sceneManager;
    this.city = city;
    this.network = network;
    this.vehicleSystem = vehicleSystem;
    this.passengerSystem = passengerSystem;
    this.economy = economy;
    this.timeSystem = timeSystem;
    this.catalog = catalog;
    this.schematicView = null; // set later via setSchematicView
    this.vehicleDesigner = null; // set later via setVehicleDesigner
    this.eventSystem = null; // set later via setEventSystem
    this.contractSystem = null; // set later via setContractSystem
    this.staffing = null; // set later via setStaffing
    this.cargoSystem = null; // set later via setCargoSystem

    this.tool = 'select';
    this.draftRoute = null;
    this.selectedStationId = null;
    this.selectedRouteId = null;
    this.selectedDepotId = null;
    this.milestoneListeners = [];

    this._cacheDom();
    this._wireTopbar();
    this._wireToolbar();
    this._wireBottombar();
    this._wireCanvasInput();
    this._wireModal();
    this.updateToolHint();
  }

  setSchematicView(view) { this.schematicView = view; }
  setVehicleDesigner(vd) { this.vehicleDesigner = vd; }
  setEventSystem(es) { this.eventSystem = es; }
  setContractSystem(cs) { this.contractSystem = cs; }
  setStaffing(s) { this.staffing = s; }
  setCargoSystem(cs) { this.cargoSystem = cs; }

  _cacheDom() {
    this.dom = {
      budget: document.querySelector('#stat-budget span'),
      satisfaction: document.querySelector('#stat-satisfaction'),
      ridership: document.querySelector('#stat-ridership span'),
      congestion: document.querySelector('#stat-congestion'),
      date: document.querySelector('#stat-date span'),
      speedBtns: [...document.querySelectorAll('.speed-btn')],
      toolBtns: [...document.querySelectorAll('.tool-btn')],
      sidepanel: document.getElementById('sidepanel'),
      panelTitle: document.getElementById('panel-title'),
      panelContent: document.getElementById('panel-content'),
      panelClose: document.getElementById('panel-close'),
      routeChipStrip: document.getElementById('route-chip-strip'),
      btnFinance: document.getElementById('btn-finance'),
      btnRoutes: document.getElementById('btn-routes'),
      btnDisruptions: document.getElementById('btn-disruptions'),
      disruptionBadge: document.getElementById('disruption-badge'),
      btnContracts: document.getElementById('btn-contracts'),
      contractBadge: document.getElementById('contract-badge'),
      btnViewToggle: document.getElementById('btn-view-toggle'),
      modalLayer: document.getElementById('modal-layer'),
      modalTitle: document.getElementById('modal-title'),
      modalContent: document.getElementById('modal-content'),
      modalClose: document.getElementById('modal-close'),
      toastContainer: document.getElementById('toast-container'),
      toolHint: document.getElementById('tool-hint'),
      canvas: document.getElementById('viewport'),
    };
  }

  // ---------------- top bar ----------------

  _wireTopbar() {
    for (const btn of this.dom.speedBtns) {
      btn.addEventListener('click', () => {
        const speed = Number(btn.dataset.speed);
        this.timeSystem.setSpeed(speed);
        for (const b of this.dom.speedBtns) b.classList.toggle('active', b === btn);
      });
    }
    this.dom.btnViewToggle.addEventListener('click', () => {
      const currentlyHidden = document.getElementById('schematic').classList.contains('hidden');
      this.setSchematicVisible(currentlyHidden);
    });
  }

  setSchematicVisible(visible) {
    document.getElementById('schematic').classList.toggle('hidden', !visible);
    this.dom.canvas.classList.toggle('hidden', visible);
    this.dom.btnViewToggle.classList.toggle('active', visible);
    if (this.schematicView) {
      this.schematicView.visible = visible;
      if (visible) this.schematicView.markDirty();
    }
  }

  refreshHud() {
    const b = this.economy.budget;
    this.dom.budget.textContent = fmtMoney(b);
    this.dom.budget.parentElement.classList.toggle('danger', b < 0);

    const sat = Math.round(this.passengerSystem.citySatisfaction);
    const satEl = this.dom.satisfaction;
    satEl.querySelector('span').textContent = `${sat}%`;
    satEl.classList.toggle('warn', sat < 55 && sat >= 35);
    satEl.classList.toggle('danger', sat < 35);

    this.dom.ridership.textContent = this.economy.dailyRidership.toLocaleString('en-US');

    const congestion = Math.round(this.economy.congestion);
    this.dom.congestion.querySelector('span').textContent = `${congestion}%`;
    this.dom.congestion.classList.toggle('warn', congestion >= 40 && congestion < 70);
    this.dom.congestion.classList.toggle('danger', congestion >= 70);

    this.dom.date.textContent = this.timeSystem.formatDate();
    this.refreshDisruptionBadge();
  }

  // ---------------- toolbar ----------------

  _wireToolbar() {
    for (const btn of this.dom.toolBtns) {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        if (tool === 'vehicle') { this.openRoutesModal(); return; }
        this._cancelDraftRoute();
        this.tool = tool;
        for (const b of this.dom.toolBtns) b.classList.toggle('active', b.dataset.tool === tool);
        this.closePanel();
        this.updateToolHint();
      });
    }
  }

  updateToolHint() {
    const hints = {
      select: '',
      station: `Click a developed zone tile near a road to build a station (${fmtMoney(STATION_COST)}).`,
      route: 'Click stations in order to add stops. Open the panel to choose a vehicle & finish.',
      depot: `Click a developed zone tile near a road to build a cargo depot (${fmtMoney(CARGO_DEPOT_COST)}).`,
      delete: 'Click a station or depot to remove it. Manage routes from the Routes panel.',
    };
    const text = hints[this.tool] || '';
    this.dom.toolHint.textContent = text;
    this.dom.toolHint.classList.toggle('hidden', !text);
  }

  // ---------------- bottom bar ----------------

  _wireBottombar() {
    this.dom.btnFinance.addEventListener('click', () => this.openFinanceModal());
    this.dom.btnRoutes.addEventListener('click', () => this.openRoutesModal());
    this.dom.btnDisruptions.addEventListener('click', () => this.openDisruptionsModal());
    this.dom.btnContracts.addEventListener('click', () => this.openContractsModal());
  }

  refreshDisruptionBadge() {
    const n = this.eventSystem?.active.length || 0;
    this.dom.disruptionBadge.textContent = String(n);
    this.dom.disruptionBadge.classList.toggle('hidden', n === 0);
    const c = (this.contractSystem?.active.length || 0) + (this.shippingContractSystem?.active.length || 0);
    this.dom.contractBadge.textContent = String(c);
    this.dom.contractBadge.classList.toggle('hidden', c === 0);
  }

  setShippingContractSystem(scs) { this.shippingContractSystem = scs; }

  openContractsModal() {
    const day = this.timeSystem.day;
    const rowFor = (c) => {
      const daysLeft = Math.max(0, c.expiresAtDay - day);
      return `<div class="disruption-item"><span>${c.label}<br><span style="font-size:11px">Reward ${fmtMoney(c.reward)} · Penalty ${fmtMoney(c.penalty)}</span></span><span class="days-left">${daysLeft}d left</span></div>`;
    };
    const contracts = this.contractSystem?.active || [];
    const rows = contracts.map(rowFor).join('') || '<p>No active contracts right now - check back after a day passes.</p>';
    const completed = this.contractSystem?.completedCount || 0;

    const shipping = this.shippingContractSystem?.active || [];
    const shippingRows = shipping.map(rowFor).join('') || '<p>No active shipping contracts right now - build a cargo depot to start receiving them.</p>';
    const shippingCompleted = this.shippingContractSystem?.completedCount || 0;

    this.openModal('Contracts', `
      <h4>Council Contracts</h4>
      ${rows}<p style="margin-top:10px;font-size:11px">Completed all-time: ${completed}</p>
      <h4 style="margin-top:16px">Shipping Contracts</h4>
      ${shippingRows}<p style="margin-top:10px;font-size:11px">Completed all-time: ${shippingCompleted}</p>
    `);
  }

  openDisruptionsModal() {
    const events = this.eventSystem?.active || [];
    const day = this.timeSystem.day;
    const rows = events.map(ev => {
      const daysLeft = Math.max(0, ev.expiresAtDay - day);
      let action = '';
      if (ev.type === 'breakdown') {
        action = `<button class="action secondary" data-rush="${ev.vehicleId}">Rush Repair (${fmtMoney(this.eventSystem.rushRepairCost)})</button>`;
      } else if (ev.type === 'strike') {
        action = `<button class="action secondary" data-settle="${ev.routeId}">Settle (${fmtMoney(this.eventSystem.settleStrikeCost)})</button>`;
      }
      return `<div class="disruption-item"><span>${ev.label}</span><span class="days-left">${daysLeft}d left</span>${action}</div>`;
    }).join('') || '<p>No active disruptions right now.</p>';

    this.openModal('Active Disruptions', rows);
    this.dom.modalContent.querySelectorAll('[data-rush]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.eventSystem.rushRepair(btn.dataset.rush)) { this.openDisruptionsModal(); this.refreshDisruptionBadge(); }
        else this.showToast('Not enough budget for a rush repair.');
      });
    });
    this.dom.modalContent.querySelectorAll('[data-settle]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.eventSystem.settleStrike(btn.dataset.settle)) { this.openDisruptionsModal(); this.refreshDisruptionBadge(); }
        else this.showToast('Not enough budget to settle the strike.');
      });
    });
  }

  refreshRouteChips() {
    this.dom.routeChipStrip.innerHTML = '';
    for (const route of this.network.routes.values()) {
      if (!route.committed) continue;
      const chip = el(`<div class="route-chip">
        <span class="dot" style="background:#${route.color.toString(16).padStart(6, '0')}"></span>
        <span>${route.name}</span>
      </div>`);
      chip.addEventListener('click', () => this.selectRoute(route.id));
      this.dom.routeChipStrip.appendChild(chip);
    }
  }

  // ---------------- canvas input (3D + schematic share this) ----------------

  _wireCanvasInput() {
    const canvas = this.dom.canvas;
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (dist > 6) return; // was a camera drag
      this._handle3DClick(e);
    });
  }

  _handle3DClick(e) {
    const canvas = this.dom.canvas;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.sceneManager.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    const { x, z } = this.city.worldToTile(hit.x, hit.z);
    this.handleWorldTileClick(x, z);
  }

  // Shared entry point for both the 3D raycast click and the schematic map click.
  handleWorldTileClick(tx, tz) {
    if (!this.city.inBounds(tx, tz)) return;
    let clickedStation = null;
    for (const s of this.network.stations.values()) {
      if (s.x === tx && s.z === tz) { clickedStation = s; break; }
    }
    let clickedDepot = null;
    if (this.cargoSystem) {
      for (const d of this.cargoSystem.depots.values()) {
        if (d.x === tx && d.z === tz) { clickedDepot = d; break; }
      }
    }

    if (this.tool === 'select') {
      if (clickedStation) this.selectStation(clickedStation.id);
      else if (clickedDepot) this.selectDepot(clickedDepot.id);
      else this.closePanel();
    } else if (this.tool === 'station') {
      this._placeStation(tx, tz);
    } else if (this.tool === 'depot') {
      this._placeDepot(tx, tz);
    } else if (this.tool === 'route') {
      if (clickedStation) this._addStationToDraft(clickedStation.id);
    } else if (this.tool === 'delete') {
      if (clickedStation) this.deleteStation(clickedStation.id);
      else if (clickedDepot) this.deleteDepot(clickedDepot.id);
    }
  }

  // ---------------- station placement ----------------

  _placeStation(tx, tz) {
    const check = this.network.canPlaceStation(tx, tz);
    if (!check.ok) { this.showToast(check.reason); return; }
    if (!this.economy.canAfford(STATION_COST)) { this.showToast('Not enough budget to build a station.'); return; }
    this.economy.spend(STATION_COST);
    const station = this.network.addStation(tx, tz);
    this.network.refreshMeshes();
    this.refreshSchematic();
    this.showToast(`Built ${station.name} (${fmtMoney(STATION_COST)})`);
    this.selectStation(station.id);
  }

  deleteStation(id) {
    const station = this.network.stations.get(id);
    if (!station) return;
    const affectedRoutes = [...station.routeIds];
    this.network.removeStation(id);
    for (const routeId of affectedRoutes) {
      const route = this.network.routes.get(routeId);
      if (!route) {
        this.vehicleSystem.removeRouteVehicles(routeId);
        this.economy.removeRouteStats(routeId);
      } else {
        this.vehicleSystem.syncRouteVehicles(route);
      }
    }
    this.network.refreshMeshes();
    this.refreshRouteChips();
    this.refreshSchematic();
    this.closePanel();
    this.showToast(`Deleted ${station.name}`);
  }

  // ---------------- cargo depots ----------------

  _placeDepot(tx, tz) {
    if (!this.cargoSystem) return;
    const check = this.cargoSystem.canPlaceDepot(tx, tz);
    if (!check.ok) { this.showToast(check.reason); return; }
    if (!this.economy.canAfford(CARGO_DEPOT_COST)) { this.showToast('Not enough budget to build a depot.'); return; }
    this.economy.spend(CARGO_DEPOT_COST);
    const depot = this.cargoSystem.addDepot(tx, tz);
    this.showToast(`Built ${depot.name} (${fmtMoney(CARGO_DEPOT_COST)})`);
    this.selectDepot(depot.id);
  }

  deleteDepot(id) {
    const depot = this.cargoSystem.depots.get(id);
    if (!depot) return;
    this.cargoSystem.removeDepot(id);
    this.closePanel();
    this.showToast(`Deleted ${depot.name}`);
  }

  selectDepot(id) {
    this.selectedDepotId = id;
    this.selectedStationId = null;
    this.selectedRouteId = null;
    const depot = this.cargoSystem.depots.get(id);
    if (!depot) return;
    this.openPanel(depot.name, this._renderDepotPanel(depot));
  }

  _renderDepotPanel(depot) {
    const model = depot.modelId ? this.catalog.get(depot.modelId) : null;
    const truckOptions = FREIGHT_CHASSIS_DEFS.filter(c => c.category === 'truck').map(c => `
      <option value="${c.id}" ${model?.chassisId === c.id ? 'selected' : ''}>${c.name} (${c.cargoCapacityTons}t · ${fmtMoney(c.baseCostPerCar)})</option>
    `).join('');

    const truckSection = model ? (() => {
      const stats = computeFreightStats(model);
      return `
        <div class="row"><span>${model.name}</span><b>${stats.capacityTonsPerCar}t/truck</b></div>
        <div class="row"><span>Carries</span><b>${stats.compatibleCargo.map(id => CARGO_TYPES[id]?.icon).join(' ')}</b></div>
        <div class="field"><label>Trucks: ${depot.truckCount} (${fmtMoney(stats.purchaseCost)} each)</label>
          <input type="range" id="depot-truck-count" min="0" max="4" value="${depot.truckCount}"></div>
      `;
    })() : `
      <div class="field"><label>Truck type</label><select id="depot-chassis">${truckOptions}</select></div>
      <button class="action" id="depot-assign">Buy First Truck</button>
    `;

    return `
      <h4>Fleet</h4>
      ${truckSection}
      <h4>Activity</h4>
      <div class="row"><span>Shipments spawned</span><b>${depot.stats.shipmentsSpawned}</b></div>
      <div class="row"><span>Shipments delivered</span><b>${depot.stats.shipmentsDelivered}</b></div>
      <div class="field"><label>Rename</label><input type="text" id="depot-name" value="${depot.name}"></div>
      <div style="margin-top:8px">
        <button class="action danger" id="depot-delete">Delete Depot</button>
      </div>
    `;
  }

  _wireDepotPanelEvents(depot) {
    const panel = this.dom.panelContent;
    panel.querySelector('#depot-name')?.addEventListener('change', (e) => {
      depot.name = e.target.value || depot.name;
      this.dom.panelTitle.textContent = depot.name;
    });
    panel.querySelector('#depot-delete')?.addEventListener('click', () => this.deleteDepot(depot.id));
    panel.querySelector('#depot-assign')?.addEventListener('click', () => {
      const chassisId = panel.querySelector('#depot-chassis').value;
      const chassis = freightChassisById(chassisId);
      const model = createDefaultFreightModel(chassisId);
      const saved = this.catalog.save(model);
      const cost = computeFreightStats(saved).purchaseCost;
      if (!this.economy.canAfford(cost)) { this.showToast('Not enough budget for a truck.'); return; }
      this.economy.spend(cost);
      this.cargoSystem.assignModelToDepot(depot, saved, 1);
      this.showToast(`Bought a ${chassis.name} (${fmtMoney(cost)})`);
      this.selectDepot(depot.id);
    });
    const countSlider = panel.querySelector('#depot-truck-count');
    countSlider?.addEventListener('change', (e) => {
      const model = this.catalog.get(depot.modelId);
      const newCount = Number(e.target.value);
      const delta = newCount - depot.truckCount;
      if (delta > 0) {
        const cost = computeFreightStats(model).purchaseCost * delta;
        if (!this.economy.canAfford(cost)) { this.showToast('Not enough budget for more trucks.'); countSlider.value = depot.truckCount; return; }
        this.economy.spend(cost);
      }
      this.cargoSystem.assignModelToDepot(depot, model, newCount);
      this.selectDepot(depot.id);
    });
  }

  // ---------------- route drafting ----------------

  _addStationToDraft(stationId) {
    if (!this.draftRoute) {
      const firstUnlocked = Object.values(VEHICLE_TYPES).find(v => v.unlocked)?.id || 'bus';
      this.draftRoute = this.network.createRoute(firstUnlocked);
      this.draftRoute.committed = false;
    }
    this.network.addStationToRoute(this.draftRoute.id, stationId);
    this.network.refreshMeshes();
    this.refreshSchematic();
    this.openPanel('New Route', this._renderDraftPanel());
  }

  _cancelDraftRoute() {
    if (this.draftRoute) {
      this.network.removeRoute(this.draftRoute.id);
      this.draftRoute = null;
      this.network.refreshMeshes();
      this.refreshSchematic();
    }
  }

  _renderDraftPanel() {
    const route = this.draftRoute;
    const info = this.network.recomputeRoutePath(route);
    const model = this.catalog.get(route.modelId);
    const vehicleCost = route.vehicleStats ? route.vehicleStats.purchaseCost * route.frequency : 0;
    const totalCost = vehicleCost + info.trackCost + info.tunnelCost;
    const stationNames = route.stationIds.map(id => this.network.stations.get(id)?.name || '?').join(' → ');

    const vehicleSection = model ? `
      <div class="row"><span>${model.name}</span><b>${route.vehicleStats.capacityTotal} cap · ${Math.round(route.vehicleStats.topSpeed)} spd</b></div>
      <div class="row"><span>Compliance</span><b style="color:${route.vehicleStats.compliance.compliant ? '#6ee7c9' : '#ff6b6b'}">${route.vehicleStats.compliance.compliant ? 'OK' : 'Non-compliant'}</b></div>
      <button class="action secondary" id="draft-choose-vehicle">Change Vehicle</button>
    ` : `
      <div class="row"><span>No vehicle selected</span></div>
      <button class="action" id="draft-choose-vehicle">Choose Vehicle</button>
    `;

    return `
      <div class="field"><label>Route name</label><input type="text" id="draft-name" value="${route.name}"></div>
      <h4>Vehicle</h4>
      ${vehicleSection}
      <h4>Stops (${route.stationIds.length})</h4>
      <div class="row"><span>${stationNames || 'Click stations on the map'}</span></div>
      <div class="field"><label>Frequency: ${route.frequency} vehicle(s)</label>
        <input type="range" id="draft-freq" min="1" max="8" value="${route.frequency}"></div>
      <div class="field"><label><input type="checkbox" id="draft-loop" ${route.loop ? 'checked' : ''}> Loop route (one-way circuit)</label></div>
      <h4>Cost</h4>
      ${model ? `<div class="row"><span>Vehicles (${route.frequency}x ${model.name})</span><b>${fmtMoney(vehicleCost)}</b></div>` : ''}
      ${info.trackCost ? `<div class="row"><span>New track (${info.trackTiles} tiles)</span><b>${fmtMoney(info.trackCost)}</b></div>` : ''}
      ${info.tunnelCost ? `<div class="row"><span>Tunnel construction</span><b>${fmtMoney(info.tunnelCost)}</b></div>` : ''}
      <div class="row"><span>Total</span><b>${fmtMoney(totalCost)}</b></div>
      <div style="margin-top:8px">
        <button class="action" id="draft-undo" ${route.stationIds.length ? '' : 'disabled'}>Undo Stop</button>
        <button class="action" id="draft-finish" ${route.stationIds.length >= 2 && model ? '' : 'disabled'}>Finish Route</button>
        <button class="action secondary" id="draft-cancel">Cancel</button>
      </div>
    `;
  }

  _openVehiclePicker() {
    const route = this.draftRoute;
    const categories = ['bus', 'tram', 'subway'];
    const sections = categories.map(cat => {
      const unlocked = VEHICLE_TYPES[cat].unlocked;
      const models = this.catalog.list(cat);
      const cards = models.map(m => `
        <div class="showroom-card">
          <img src="${m.thumbnail || ''}" class="showroom-thumb ${m.thumbnail ? '' : 'hidden'}">
          <div class="showroom-name">${m.name}</div>
          <button class="action secondary" data-pick="${m.id}">Select</button>
        </div>
      `).join('') || '<p>No designs yet for this category.</p>';
      return `<h4>${VEHICLE_TYPES[cat].label}${unlocked ? '' : ' 🔒 locked'}</h4>${unlocked ? `<div class="showroom-grid">${cards}</div>` : ''}`;
    }).join('');

    this.openModal('Choose a Vehicle', `
      ${sections}
      <button class="action" id="picker-design-new" style="margin-top:10px">＋ Design a New Vehicle</button>
    `);
    this.dom.modalContent.querySelectorAll('[data-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        const model = this.catalog.get(btn.dataset.pick);
        this.network.assignModelToRoute(route, model, this.economy.activeRegulationId);
        this.network.refreshMeshes();
        this.refreshSchematic();
        this.closeModal();
        this.openPanel('New Route', this._renderDraftPanel());
      });
    });
    document.getElementById('picker-design-new').addEventListener('click', () => {
      this.closeModal();
      this.vehicleDesigner?.open();
    });
  }

  _wireDraftPanelEvents() {
    const route = this.draftRoute;
    const panel = this.dom.panelContent;
    panel.querySelector('#draft-choose-vehicle')?.addEventListener('click', () => this._openVehiclePicker());
    const nameInput = panel.querySelector('#draft-name');
    nameInput?.addEventListener('change', () => { route.name = nameInput.value || route.name; });
    const freq = panel.querySelector('#draft-freq');
    freq?.addEventListener('change', () => {
      this.network.setRouteFrequency(route.id, Number(freq.value));
      this.openPanel('New Route', this._renderDraftPanel());
    });
    const loop = panel.querySelector('#draft-loop');
    loop?.addEventListener('change', () => {
      this.network.setRouteLoop(route.id, loop.checked);
      this.network.refreshMeshes();
      this.refreshSchematic();
      this.openPanel('New Route', this._renderDraftPanel());
    });
    panel.querySelector('#draft-undo')?.addEventListener('click', () => {
      route.stationIds.pop();
      this.network.recomputeRoutePath(route);
      this.network.refreshMeshes();
      this.refreshSchematic();
      this.openPanel('New Route', this._renderDraftPanel());
    });
    panel.querySelector('#draft-cancel')?.addEventListener('click', () => {
      this._cancelDraftRoute();
      this.closePanel();
    });
    panel.querySelector('#draft-finish')?.addEventListener('click', () => this._finishDraftRoute());
  }

  _finishDraftRoute() {
    const route = this.draftRoute;
    if (!route || route.stationIds.length < 2) return;
    if (!route.modelId) { this.showToast('Choose a vehicle before finishing the route.'); return; }
    const info = this.network.recomputeRoutePath(route);
    const vehicleCost = route.vehicleStats.purchaseCost * route.frequency;
    const totalCost = vehicleCost + info.trackCost + info.tunnelCost;
    if (!this.economy.canAfford(totalCost)) { this.showToast(`Not enough budget - need ${fmtMoney(totalCost)}.`); return; }
    this.economy.spend(totalCost, route.id);
    this.network.commitTrackConstruction(route);
    route.committed = true;
    this.vehicleSystem.syncRouteVehicles(route);
    this.draftRoute = null;
    this.network.refreshMeshes();
    this.refreshRouteChips();
    this.refreshSchematic();
    this.showToast(`Route ${route.name} launched! (${fmtMoney(totalCost)})`);
    this.selectRoute(route.id);
  }

  // ---------------- selection & side panel ----------------

  selectStation(id) {
    this.selectedStationId = id;
    this.selectedRouteId = null;
    const station = this.network.stations.get(id);
    if (!station) return;
    this.openPanel(station.name, this._renderStationPanel(station));
  }

  _renderStationPanel(station) {
    const routes = [...station.routeIds].map(id => this.network.routes.get(id)).filter(Boolean);
    const routeRows = routes.map(r => `
      <div class="stationlist-item"><span class="swatch" style="background:#${r.color.toString(16).padStart(6, '0')}"></span>${r.name} (${this.catalog.get(r.modelId)?.name || VEHICLE_TYPES[r.type].label})</div>
    `).join('') || '<div class="row"><span>No routes yet</span></div>';

    return `
      <div class="row"><span>Waiting passengers</span><b>${station.waitingPassengers.length}</b></div>
      <div class="row"><span>Catchment radius</span><b>${station.radius.toFixed(0)}m</b></div>
      <h4>Routes serving this stop</h4>
      ${routeRows}
      <div class="field"><label>Rename</label><input type="text" id="station-name" value="${station.name}"></div>
      <div style="margin-top:8px">
        <button class="action danger" id="station-delete">Delete Station</button>
      </div>
    `;
  }

  _wireStationPanelEvents(station) {
    const panel = this.dom.panelContent;
    panel.querySelector('#station-name')?.addEventListener('change', (e) => {
      station.name = e.target.value || station.name;
      this.network.refreshMeshes();
      this.refreshSchematic();
      this.dom.panelTitle.textContent = station.name;
    });
    panel.querySelector('#station-delete')?.addEventListener('click', () => this.deleteStation(station.id));
  }

  selectRoute(id) {
    this.selectedRouteId = id;
    this.selectedStationId = null;
    const route = this.network.routes.get(id);
    if (!route) return;
    this.openPanel(route.name, this._renderRoutePanel(route));
  }

  _renderRoutePanel(route) {
    const stationNames = route.stationIds.map(id => this.network.stations.get(id)?.name || '?').join(' → ');
    const profitToday = this.economy.routeProfitToday(route.id);
    const rstats = this.economy.routeStats.get(route.id);
    const model = this.catalog.get(route.modelId);
    const fleetRows = route.vehicleIds.map(vid => {
      const v = this.vehicleSystem.vehicles.get(vid);
      if (!v) return '';
      const wearPct = Math.round(v.wearFactor * 100);
      const refurbCost = model ? Math.round(model ? route.vehicleStats.purchaseCost * 0.3 * v.wearFactor : 0) : 0;
      return `
        <div class="stationlist-item" style="flex-direction:column;align-items:stretch;gap:3px">
          <div class="row"><span>${(v.mileageKm).toFixed(0)} km · ${v.ageSimDays.toFixed(0)}d old</span><b>${wearPct}% worn</b></div>
          <div class="bar-track"><div class="bar-fill" style="width:${100 - wearPct}%;background:${wearPct > 60 ? '#ff6b6b' : wearPct > 30 ? '#ffd166' : '#6ee7c9'}"></div></div>
          ${v.brokenDown ? `<button class="action danger" data-rush="${vid}">🔧 Broken down - Rush Repair (${fmtMoney(this.eventSystem?.rushRepairCost || 0)})</button>` : ''}
          ${!v.brokenDown && wearPct > 5 ? `<button class="action secondary" data-refurbish="${vid}">Refurbish (${fmtMoney(refurbCost)})</button>` : ''}
        </div>`;
    }).join('') || '<div class="row"><span>No vehicles yet</span></div>';

    return `
      ${route.strikeActive ? `<div class="row violation" style="margin-bottom:6px">⚠️ Driver strike - service suspended
        <button class="action secondary" data-settle-strike style="margin-left:8px">Settle (${fmtMoney(this.eventSystem?.settleStrikeCost || 0)})</button></div>` : ''}
      <div class="row"><span>Vehicle</span><b>${model ? model.name : 'Unassigned'}${route.loop ? ' (loop)' : ''}</b></div>
      <div class="row"><span>Stops</span><b>${route.stationIds.length}</b></div>
      <div class="row"><span>Riders today</span><b>${rstats?.ridersToday || 0}</b></div>
      <div class="row"><span>Profit today</span><b style="color:${profitToday >= 0 ? '#6ee7c9' : '#ff6b6b'}">${fmtMoney(profitToday)}</b></div>
      <div class="row"><span>Route</span><b style="font-weight:400;font-size:11px">${stationNames}</b></div>
      <div class="field"><label>Frequency: ${route.frequency} vehicle(s)</label>
        <input type="range" id="route-freq" min="1" max="8" value="${route.frequency}"></div>
      <div class="field"><label>Rename</label><input type="text" id="route-name" value="${route.name}"></div>
      <h4>Fleet</h4>
      ${fleetRows}
      <div style="margin-top:8px">
        <button class="action danger" id="route-delete">Delete Route</button>
      </div>
    `;
  }

  _wireRoutePanelEvents(route) {
    const panel = this.dom.panelContent;
    panel.querySelector('#route-name')?.addEventListener('change', (e) => {
      route.name = e.target.value || route.name;
      this.refreshRouteChips();
      this.dom.panelTitle.textContent = route.name;
    });
    panel.querySelector('#route-freq')?.addEventListener('change', (e) => {
      const newFreq = Number(e.target.value);
      const delta = newFreq - route.frequency;
      const unitCost = route.vehicleStats?.purchaseCost || 0;
      if (delta > 0) {
        const cost = delta * unitCost;
        if (!this.economy.canAfford(cost)) { this.showToast(`Need ${fmtMoney(cost)} for ${delta} more vehicle(s).`); this.openPanel(route.name, this._renderRoutePanel(route)); return; }
        this.economy.spend(cost, route.id);
      } else if (delta < 0) {
        this.economy.budget += (-delta) * unitCost * 0.5;
      }
      this.network.setRouteFrequency(route.id, newFreq);
      this.vehicleSystem.syncRouteVehicles(route);
      this.openPanel(route.name, this._renderRoutePanel(route));
    });
    panel.querySelectorAll('[data-refurbish]').forEach(btn => {
      btn.addEventListener('click', () => {
        const vid = btn.dataset.refurbish;
        const v = this.vehicleSystem.vehicles.get(vid);
        if (!v) return;
        const cost = Math.round(route.vehicleStats.purchaseCost * 0.3 * v.wearFactor);
        if (!this.economy.canAfford(cost)) { this.showToast(`Need ${fmtMoney(cost)} to refurbish.`); return; }
        this.economy.spend(cost, route.id);
        this.vehicleSystem.refurbish(vid);
        this.openPanel(route.name, this._renderRoutePanel(route));
      });
    });
    panel.querySelectorAll('[data-rush]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.eventSystem.rushRepair(btn.dataset.rush)) { this.openPanel(route.name, this._renderRoutePanel(route)); this.refreshDisruptionBadge(); }
        else this.showToast('Not enough budget for a rush repair.');
      });
    });
    panel.querySelector('[data-settle-strike]')?.addEventListener('click', () => {
      if (this.eventSystem.settleStrike(route.id)) { this.openPanel(route.name, this._renderRoutePanel(route)); this.refreshDisruptionBadge(); }
      else this.showToast('Not enough budget to settle the strike.');
    });
    panel.querySelector('#route-delete')?.addEventListener('click', () => {
      this.vehicleSystem.removeRouteVehicles(route.id);
      this.economy.removeRouteStats(route.id);
      this.network.removeRoute(route.id);
      this.network.refreshMeshes();
      this.refreshRouteChips();
      this.refreshSchematic();
      this.closePanel();
      this.showToast(`Deleted ${route.name}`);
    });
  }

  // ---------------- side panel plumbing ----------------

  openPanel(title, html) {
    this.dom.sidepanel.classList.remove('hidden');
    this.dom.panelTitle.textContent = title;
    this.dom.panelContent.innerHTML = html;
    if (this.draftRoute && title === 'New Route') this._wireDraftPanelEvents();
    else if (this.selectedStationId) this._wireStationPanelEvents(this.network.stations.get(this.selectedStationId));
    else if (this.selectedRouteId) this._wireRoutePanelEvents(this.network.routes.get(this.selectedRouteId));
    else if (this.selectedDepotId) this._wireDepotPanelEvents(this.cargoSystem.depots.get(this.selectedDepotId));
    this.dom.panelClose.onclick = () => { this._cancelDraftRoute(); this.closePanel(); };
  }

  closePanel() {
    this.dom.sidepanel.classList.add('hidden');
    this.selectedStationId = null;
    this.selectedRouteId = null;
    this.selectedDepotId = null;
  }

  // refresh whatever is currently open (called every so often so live stats stay fresh)
  refreshOpenPanel() {
    if (this.draftRoute) return; // draft panel only updates on user actions
    if (this.selectedStationId) {
      const s = this.network.stations.get(this.selectedStationId);
      if (s) { this.dom.panelContent.innerHTML = this._renderStationPanel(s); this._wireStationPanelEvents(s); }
    } else if (this.selectedRouteId) {
      const r = this.network.routes.get(this.selectedRouteId);
      if (r) { this.dom.panelContent.innerHTML = this._renderRoutePanel(r); this._wireRoutePanelEvents(r); }
    } else if (this.selectedDepotId) {
      const d = this.cargoSystem?.depots.get(this.selectedDepotId);
      if (d) { this.dom.panelContent.innerHTML = this._renderDepotPanel(d); this._wireDepotPanelEvents(d); }
    }
  }

  // ---------------- modal: finance dashboard ----------------

  openFinanceModal() {
    const hist = this.economy.history.slice(-14);
    const rows = hist.map(h => `
      <tr><td>Day ${h.day}</td><td>${fmtMoney(h.income)}</td><td>${fmtMoney(h.expense)}</td>
      <td style="color:${h.profit >= 0 ? '#6ee7c9' : '#ff6b6b'}">${fmtMoney(h.profit)}</td>
      <td>${h.ridership}</td><td>${Math.round(h.satisfaction)}%</td><td>${fmtMoney(h.freightRevenue || 0)}</td></tr>
    `).join('') || '<tr><td colspan="7">No data yet - let a day pass.</td></tr>';

    const routeRows = [...this.network.routes.values()].filter(r => r.committed).map(r => {
      const stats = this.economy.routeStats.get(r.id);
      const profit = (stats?.revenueTotal || 0) - (stats?.costTotal || 0);
      return `<tr><td>${r.name}</td><td>${this.catalog.get(r.modelId)?.name || VEHICLE_TYPES[r.type].label}</td><td>${stats?.ridersTotal || 0}</td>
        <td style="color:${profit >= 0 ? '#6ee7c9' : '#ff6b6b'}">${fmtMoney(profit)}</td></tr>`;
    }).join('') || '<tr><td colspan="4">No routes yet.</td></tr>';

    const regButtons = REGULATION_PRESETS.map(r => `
      <button class="action ${this.economy.activeRegulationId === r.id ? '' : 'secondary'}" data-reg="${r.id}">${r.label}</button>
    `).join('');

    const html = `
      <div class="row"><span>Budget</span><b>${fmtMoney(this.economy.budget)}</b></div>
      <div class="row"><span>Outstanding debt</span><b>${fmtMoney(this.economy.debt)}</b></div>
      <div class="row"><span>Fare per trip</span><b>${fmtMoney(this.economy.fare)}</b></div>
      <div class="field"><label>Adjust fare</label>
        <input type="range" id="fare-slider" min="1" max="8" step="0.25" value="${this.economy.fare}"></div>
      <div style="margin:8px 0">
        <button class="action" id="loan-btn">Take $200,000 Loan (4%/wk)</button>
      </div>
      <h4>City vehicle regulation</h4>
      <div>${regButtons}</div>
      <h4>Workforce</h4>
      <div class="row"><span>Drivers</span><b>${this.staffing.drivers} / ${this.staffing.requiredDrivers(this.network)} needed</b></div>
      <div class="row"><span>Mechanics</span><b>${this.staffing.mechanics} / ${this.staffing.requiredMechanics(this.network)} needed</b></div>
      <div class="row"><span>Morale</span><b>${Math.round(this.staffing.morale)}%</b></div>
      <div class="bar-track"><div class="bar-fill" style="width:${this.staffing.morale}%;background:${this.staffing.morale < 40 ? '#ff6b6b' : this.staffing.morale < 70 ? '#ffd166' : '#6ee7c9'}"></div></div>
      <div style="margin:6px 0">
        <button class="action secondary" id="hire-driver-btn">Hire Driver (${fmtMoney(this.staffing.hireDriverCost)})</button>
        <button class="action secondary" id="hire-mechanic-btn">Hire Mechanic (${fmtMoney(this.staffing.hireMechanicCost)})</button>
        <button class="action secondary" id="train-btn">Train Staff (${fmtMoney(this.staffing.trainCost)})</button>
      </div>
      <h4>Recent days</h4>
      <table><thead><tr><th>Day</th><th>Income</th><th>Expense</th><th>Profit</th><th>Riders</th><th>Sat.</th><th>Freight</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <h4>Route profitability (all-time)</h4>
      <table><thead><tr><th>Route</th><th>Type</th><th>Riders</th><th>Profit</th></tr></thead>
      <tbody>${routeRows}</tbody></table>
      <h4>Freight</h4>
      <div class="row"><span>Freight revenue today</span><b style="color:#6ee7c9">${fmtMoney(this.economy.dailyFreightRevenue)}</b></div>
      <div class="row"><span>Freight revenue (all-time)</span><b>${fmtMoney(this.economy.totalFreightRevenue)}</b></div>
      <div class="row"><span>Depots / trucks</span><b>${this.cargoSystem?.depots.size || 0} / ${this.cargoSystem?.trucks.size || 0}</b></div>
      <div class="row"><span>Shipments delivered / spoiled</span><b>${this.cargoSystem?.deliveredCount || 0} / ${this.cargoSystem?.spoiledCount || 0}</b></div>
      <h4>Network stats</h4>
      <div class="row"><span>Coverage</span><b>${Math.round(this.network.coveragePercent() * 100)}%</b></div>
      <div class="row"><span>Lost demand today</span><b>${this.economy.lostDemandToday}</b></div>
      <div class="row"><span>Car trips today</span><b>${this.economy.carTripsToday}</b></div>
      <div class="row"><span>Road congestion</span><b>${Math.round(this.economy.congestion)}%</b></div>
      ${this.economy.fuelPriceMultiplier !== 1 ? `<div class="row violation">⚠️ Fuel price shock: running costs ×${this.economy.fuelPriceMultiplier.toFixed(2)} for combustion vehicles</div>` : ''}
      ${this.economy.subsidyMultiplier !== 1 ? `<div class="row violation">⚠️ Subsidy cut: per-rider government top-up reduced</div>` : ''}
      ${this.economy.weatherSpeedMultiplier !== 1 ? `<div class="row violation">⚠️ Storm: surface routes running slower</div>` : ''}
    `;
    this.openModal('Finance Dashboard', html);
    document.getElementById('fare-slider')?.addEventListener('input', (e) => { this.economy.fare = Number(e.target.value); });
    document.getElementById('loan-btn')?.addEventListener('click', () => {
      this.economy.takeLoan(200000);
      this.openFinanceModal();
      this.showToast('Took a $200,000 loan.');
    });
    this.dom.modalContent.querySelectorAll('[data-reg]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.economy.activeRegulationId = btn.dataset.reg;
        this.network.resyncAllVehicleStats(this.economy.activeRegulationId);
        this.openFinanceModal();
      });
    });
    document.getElementById('hire-driver-btn')?.addEventListener('click', () => {
      if (this.staffing.hireDriver()) this.openFinanceModal();
      else this.showToast('Not enough budget to hire a driver.');
    });
    document.getElementById('hire-mechanic-btn')?.addEventListener('click', () => {
      if (this.staffing.hireMechanic()) this.openFinanceModal();
      else this.showToast('Not enough budget to hire a mechanic.');
    });
    document.getElementById('train-btn')?.addEventListener('click', () => {
      if (this.staffing.train()) this.openFinanceModal();
      else this.showToast('Not enough budget to train staff.');
    });
  }

  // ---------------- modal: routes list ----------------

  openRoutesModal() {
    const routes = [...this.network.routes.values()].filter(r => r.committed);
    const rows = routes.map(r => {
      const stats = this.economy.routeStats.get(r.id);
      const profit = (stats?.revenueToday || 0) - (stats?.costToday || 0);
      return `
      <tr>
        <td><span class="swatch" style="display:inline-block;background:#${r.color.toString(16).padStart(6, '0')}"></span> ${r.name}</td>
        <td>${this.catalog.get(r.modelId)?.name || VEHICLE_TYPES[r.type].label}</td>
        <td>${r.stationIds.length}</td>
        <td>${r.frequency}</td>
        <td style="color:${profit >= 0 ? '#6ee7c9' : '#ff6b6b'}">${fmtMoney(profit)}</td>
        <td><button class="action secondary" data-view="${r.id}">View</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6">No routes yet. Use the Route tool to connect stations.</td></tr>';

    this.openModal('Routes', `
      <table><thead><tr><th>Name</th><th>Type</th><th>Stops</th><th>Vehicles</th><th>Profit/day</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table>
    `);
    this.dom.modalContent.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => { this.closeModal(); this.selectRoute(btn.dataset.view); });
    });
  }

  // ---------------- generic modal ----------------

  _wireModal() {
    this.dom.modalClose.addEventListener('click', () => this.closeModal());
    this.dom.modalLayer.addEventListener('click', (e) => { if (e.target === this.dom.modalLayer) this.closeModal(); });
  }

  openModal(title, html) {
    this.dom.modalTitle.textContent = title;
    this.dom.modalContent.innerHTML = html;
    this.dom.modalLayer.classList.remove('hidden');
  }

  closeModal() { this.dom.modalLayer.classList.add('hidden'); }

  // ---------------- toasts ----------------

  showToast(message, milestone = false) {
    const toast = el(`<div class="toast${milestone ? ' milestone' : ''}">${message}</div>`);
    this.dom.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), milestone ? 6500 : 4000);
  }

  showDayToast(day, econSnapshot) {
    this.showToast(`Day ${day} complete — ${econSnapshot.ridership} riders, profit ${fmtMoney(econSnapshot.profit)}`);
  }

  showWeekSummary(week, economySnapshot, unlockNotes) {
    const html = `
      <div class="row"><span>Week</span><b>${week}</b></div>
      <div class="row"><span>Total riders</span><b>${economySnapshot.ridership}</b></div>
      <div class="row"><span>Net profit</span><b>${fmtMoney(economySnapshot.profit)}</b></div>
      <div class="row"><span>Avg satisfaction</span><b>${Math.round(economySnapshot.satisfaction)}%</b></div>
      <div class="row"><span>Network coverage</span><b>${Math.round(economySnapshot.coverage * 100)}%</b></div>
      ${unlockNotes.length ? `<h4>New this week</h4>${unlockNotes.map(n => `<div class="row"><span>${n}</span></div>`).join('')}` : ''}
    `;
    this.openModal(`Week ${week} Summary`, html);
  }

  refreshSchematic() {
    if (this.schematicView) this.schematicView.markDirty();
  }
}
