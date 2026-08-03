import { VEHICLE_TYPES } from './config.js';
import { SceneManager } from './scene.js';
import { City } from './city.js';
import { Network } from './network.js';
import { VehicleSystem } from './vehicles.js';
import { PassengerSystem } from './passengers.js';
import { Economy } from './economy.js';
import { TimeSystem } from './time.js';
import { UIController } from './ui.js';
import { SchematicView } from './schematicView.js';
import { Catalog } from './designer/catalog.js';
import { VehicleDesigner } from './designer/designerUI.js';
import { EventSystem } from './events.js';
import { ContractSystem } from './contracts.js';
import { Staffing } from './staffing.js';
import { NewsTicker } from './newsTicker.js';
import { AudioSystem } from './audio.js';
import { SaveLoadSystem } from './saveLoad.js';
import { CargoSystem, bumpCargoIdCounter } from './cargo.js';
import { ShippingContractSystem } from './shippingContracts.js';
import { BuildingEditor } from './buildings/buildingEditorUI.js';
import { BuildingCatalog } from './buildings/buildingCatalog.js';
import { StationDesigner } from './stations/stationEditorUI.js';
import { StationCatalog } from './stations/stationCatalog.js';
import { allScenarios, exportScenario, importScenarioFromFile, deleteCustomScenario } from './scenarios.js';

const canvas = document.getElementById('viewport');
const sceneManager = new SceneManager(canvas);

const city = new City();
city.buildMeshes(sceneManager.scene);

const catalog = new Catalog();

const network = new Network(city, catalog);
network.buildMeshes(sceneManager.scene);

const economy = new Economy();

const vehicleSystem = new VehicleSystem(network, catalog, economy);
vehicleSystem.buildMeshes(sceneManager.scene);

const passengerSystem = new PassengerSystem(city, network, economy, vehicleSystem);
passengerSystem.buildMeshes(sceneManager.scene);

const cargoSystem = new CargoSystem(city, network, economy);
cargoSystem.buildMeshes(sceneManager.scene);
cargoSystem.setCatalog(catalog);

const timeSystem = new TimeSystem();

const ui = new UIController({ sceneManager, city, network, vehicleSystem, passengerSystem, economy, timeSystem, catalog });
ui.setCargoSystem(cargoSystem);

const schematicView = new SchematicView({
  canvas: document.getElementById('schematic'),
  city, network, vehicleSystem, cargoSystem,
  onTileClick: (x, z) => ui.handleWorldTileClick(x, z),
});
ui.setSchematicView(schematicView);

const vehicleDesigner = new VehicleDesigner({ catalog, network, economy, ui });
ui.setVehicleDesigner(vehicleDesigner);
document.getElementById('btn-design-vehicle').addEventListener('click', () => vehicleDesigner.open());

const buildingCatalog = new BuildingCatalog();
const buildingEditor = new BuildingEditor({ catalog: buildingCatalog, ui });
ui.setBuildingCatalog(buildingCatalog);
ui.setBuildingEditor(buildingEditor);
document.getElementById('btn-build-creator').addEventListener('click', () => buildingEditor.open());

const stationCatalog = new StationCatalog();
const stationDesigner = new StationDesigner({ catalog: stationCatalog, ui });
ui.setStationCatalog(stationCatalog);
ui.setStationDesigner(stationDesigner);
document.getElementById('btn-station-designer').addEventListener('click', () => stationDesigner.open());

const staffing = new Staffing(economy);
ui.setStaffing(staffing);

const eventSystem = new EventSystem({ network, vehicleSystem, economy, city, ui, staffing, cargoSystem });
ui.setEventSystem(eventSystem);

const contractSystem = new ContractSystem({ city, network, economy, passengerSystem, ui });
ui.setContractSystem(contractSystem);

const shippingContractSystem = new ShippingContractSystem({ cargoSystem, economy, ui });
ui.setShippingContractSystem(shippingContractSystem);

const newsTicker = new NewsTicker({
  el: document.getElementById('news-ticker-text'),
  network, economy, passengerSystem, vehicleSystem, catalog, cargoSystem,
});

const saveLoadSystem = new SaveLoadSystem({
  city, network, vehicleSystem, economy, timeSystem, eventSystem, contractSystem, staffing, ui, schematicView,
  cargoSystem, shippingContractSystem, buildingCatalog,
});

function fmtWhen(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function openSaveLoadModal() {
  const slots = saveLoadSystem.listSlots();
  const rows = slots.map((meta, i) => `
    <div class="disruption-item">
      <span>Slot ${i + 1}${meta ? ` - Day ${meta.day}, ${fmtMoneyLocal(meta.budget)}<br><span style="font-size:11px">${fmtWhen(meta.savedAt)}</span>` : ' - empty'}</span>
      <span>
        <button class="action secondary" data-save-slot="${i}">Save</button>
        ${meta ? `<button class="action secondary" data-load-slot="${i}">Load</button><button class="action danger" data-delete-slot="${i}">Delete</button>` : ''}
      </span>
    </div>`).join('');
  ui.openModal('Save / Load', rows);
  ui.dom.modalContent.querySelectorAll('[data-save-slot]').forEach(btn => {
    btn.addEventListener('click', () => {
      saveLoadSystem.save(Number(btn.dataset.saveSlot));
      ui.showToast('Game saved.');
      openSaveLoadModal();
    });
  });
  ui.dom.modalContent.querySelectorAll('[data-load-slot]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (saveLoadSystem.load(Number(btn.dataset.loadSlot))) {
        checkMilestones();
        ui.closeModal();
        ui.showToast('Game loaded.');
      } else {
        ui.showToast('Could not load that slot.');
      }
    });
  });
  ui.dom.modalContent.querySelectorAll('[data-delete-slot]').forEach(btn => {
    btn.addEventListener('click', () => {
      saveLoadSystem.deleteSlot(Number(btn.dataset.deleteSlot));
      openSaveLoadModal();
    });
  });
}
function fmtMoneyLocal(n) { return `$${Math.round(n).toLocaleString('en-US')}`; }
document.getElementById('btn-save-load').addEventListener('click', openSaveLoadModal);

const heatmapBtn = document.getElementById('btn-heatmap-toggle');
const heatmapCycle = ['off', 'demand', 'crowding', 'freight'];
const heatmapLabels = { off: 'Off', demand: 'Demand', crowding: 'Crowding', freight: 'Freight' };
heatmapBtn.addEventListener('click', () => {
  const next = heatmapCycle[(heatmapCycle.indexOf(schematicView.heatmapMode) + 1) % heatmapCycle.length];
  schematicView.setHeatmapMode(next);
  heatmapBtn.textContent = `🔥 Heatmap: ${heatmapLabels[next]}`;
  heatmapBtn.classList.toggle('active', next !== 'off');
});

const audioSystem = new AudioSystem();
const audioBtn = document.getElementById('btn-audio-toggle');
audioBtn.addEventListener('click', () => {
  const on = audioSystem.toggleMute();
  audioBtn.textContent = on ? '🔊' : '🔇';
});
vehicleSystem.on('arrive', ({ vehicle }) => {
  audioSystem.playArrivalChime();
  const model = catalog.get(vehicle.modelId);
  if (model) audioSystem.playDeparture(model.powertrainId);
});

sceneManager.setTimeOfDay(timeSystem.hour);
city.setWindowGlow(timeSystem.hour);
ui.refreshHud();
ui.showToast('Welcome! Pick the Station tool and click a colored zone tile near a road to start your network.');

// ---------------- milestones & progression ----------------

const milestones = [
  {
    id: 'tram', done: false,
    check: () => economy.totalRidership >= 400,
    unlock: () => { VEHICLE_TYPES.tram.unlocked = true; },
    text: '🚊 Milestone reached: Tram unlocked! Draw a route and pick Tram for street-level rail.',
  },
  {
    id: 'subway', done: false,
    check: () => weeklyAvgSatisfaction() !== null && weeklyAvgSatisfaction() >= 70,
    unlock: () => { VEHICLE_TYPES.subway.unlocked = true; },
    text: '🚇 Milestone reached: Subway unlocked! Tunnel under roads and the river for high-capacity express lines.',
  },
  {
    id: 'revenue_1m', done: false,
    check: () => economy.totalRevenue >= 1000000,
    unlock: () => {},
    text: '💰 Milestone reached: Lifetime fare revenue passed $1,000,000!',
  },
  {
    id: 'riders_2000', done: false,
    check: () => economy.totalRidership >= 2000,
    unlock: () => {},
    text: '🧍 Milestone reached: 2,000 total riders carried!',
  },
  {
    id: 'coverage_50', done: false,
    check: () => network.coveragePercent() >= 0.5,
    unlock: () => {},
    text: '🗺️ Milestone reached: Your network now covers over 50% of the city!',
  },
  {
    id: 'fleet_compliant', done: false,
    check: () => {
      const committed = [...network.routes.values()].filter(r => r.committed && r.modelId);
      return committed.length >= 2 && committed.every(r => r.vehicleStats?.compliance?.compliant);
    },
    unlock: () => {},
    text: '📋 Milestone reached: Your entire fleet meets the active regulation!',
  },
];

function weeklyAvgSatisfaction() {
  const last7 = economy.history.slice(-7);
  if (last7.length < 7) return null;
  return last7.reduce((a, h) => a + h.satisfaction, 0) / 7;
}

function checkMilestones() {
  const unlockedNow = [];
  for (const m of milestones) {
    if (!m.done && m.check()) {
      m.done = true;
      m.unlock();
      ui.showToast(m.text, true);
      unlockedNow.push(m.text);
    }
  }
  return unlockedNow;
}

// ---------------- sim clock wiring ----------------

timeSystem.on('tick', (simMinutes) => {
  const hour = timeSystem.hour;
  city.update(simMinutes);
  passengerSystem.update(simMinutes, hour);
  vehicleSystem.update(simMinutes);
  cargoSystem.update(simMinutes);
  sceneManager.setTimeOfDay(hour);
  city.setWindowGlow(hour);
  audioSystem.setRushHourIntensity(TimeSystem.demandMultiplier(hour));
});

let pendingUnlockNotes = [];

timeSystem.on('newDay', (newDay) => {
  const endedDay = newDay - 1;
  const satisfaction = passengerSystem.citySatisfaction;
  const coverage = network.coveragePercent();
  economy.applyDailyCosts(network);
  economy.closeDay(endedDay, satisfaction, coverage);

  // ambient daily nudge: a poorly-covered city drifts toward more car traffic
  economy.congestion = Math.max(0, Math.min(100, economy.congestion + (1 - coverage) * 8 - coverage * 4));

  eventSystem.onNewDay(newDay);
  contractSystem.onNewDay(newDay);
  staffing.onNewDay(network, cargoSystem);
  cargoSystem.onNewDay();
  shippingContractSystem.onNewDay(newDay);

  const last = economy.history[economy.history.length - 1];
  if (last) ui.showDayToast(endedDay, last);

  pendingUnlockNotes.push(...checkMilestones());

  // slow city growth, gated on the network keeping people reasonably happy
  if (endedDay % 4 === 0 && city.percentUnlocked < 1 && satisfaction >= 45) {
    const grew = city.unlockNextRing();
    if (grew) {
      network.refreshMeshes();
      ui.refreshSchematic();
      const note = '🏙️ The city has grown! A new district has been developed.';
      ui.showToast(note, true);
      pendingUnlockNotes.push(note);
    }
  }
});

timeSystem.on('newWeek', (week) => {
  economy.applyWeeklyInterest();
  const last7 = economy.history.slice(-7);
  const ridership = last7.reduce((a, h) => a + h.ridership, 0);
  const profit = last7.reduce((a, h) => a + h.profit, 0);
  const satisfaction = last7.length ? last7.reduce((a, h) => a + h.satisfaction, 0) / last7.length : passengerSystem.citySatisfaction;
  const coverage = network.coveragePercent();
  ui.showWeekSummary(week - 1, { ridership, profit, satisfaction, coverage }, pendingUnlockNotes);
  pendingUnlockNotes = [];
});

// ---------------- render / game loop ----------------

let lastTime = performance.now();
let hudAccum = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(now - lastTime, 250);
  lastTime = now;

  timeSystem.update(dt);
  sceneManager.render();
  if (schematicView.visible) schematicView.render();
  if (vehicleDesigner.isOpen) vehicleDesigner.render(dt / 1000);
  if (buildingEditor.isOpen) buildingEditor.render(dt / 1000);
  if (stationDesigner.isOpen) stationDesigner.render();
  newsTicker.update(dt);

  hudAccum += dt;
  if (hudAccum > 400) {
    hudAccum = 0;
    ui.refreshHud();
    ui.refreshOpenPanel();
  }
}
requestAnimationFrame(animate);

// ---------------- start menu ----------------

function setSpeedButtons(speed) {
  timeSystem.setSpeed(speed);
  for (const b of document.querySelectorAll('.speed-btn')) b.classList.toggle('active', Number(b.dataset.speed) === speed);
}

function hideStartMenu() {
  document.getElementById('start-menu').classList.add('hidden');
}

function renderStartMenu() {
  const continueSection = document.getElementById('start-continue-section');
  const slots = saveLoadSystem.listSlots();
  const anySaves = slots.some(Boolean);
  continueSection.innerHTML = anySaves ? `<h4>Continue</h4>${slots.map((meta, i) => meta ? `
    <div class="continue-row">
      <span>Slot ${i + 1} - Day ${meta.day}, $${Math.round(meta.budget).toLocaleString('en-US')}</span>
      <button class="action" data-continue-slot="${i}">Continue</button>
    </div>` : '').join('')}` : '';
  continueSection.querySelectorAll('[data-continue-slot]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (saveLoadSystem.load(Number(btn.dataset.continueSlot))) {
        checkMilestones();
        for (const b of document.querySelectorAll('.speed-btn')) b.classList.toggle('active', Number(b.dataset.speed) === timeSystem.speed);
        hideStartMenu();
      }
    });
  });

  const grid = document.getElementById('start-scenario-grid');
  grid.innerHTML = allScenarios().map(sc => `
    <div class="scenario-card">
      <h5>${sc.name}</h5>
      <p>${sc.description || ''}</p>
      <div class="scenario-actions">
        <button class="action" data-play-scenario="${sc.id}">Play</button>
        <button class="action secondary" data-export-scenario="${sc.id}">Export</button>
        ${sc.builtin ? '' : `<button class="action danger" data-delete-scenario="${sc.id}">Delete</button>`}
      </div>
    </div>`).join('');
  const scenarioList = allScenarios();
  grid.querySelectorAll('[data-play-scenario]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sc = scenarioList.find(s => s.id === btn.dataset.playScenario);
      if (!sc) return;
      const seed = sc.randomSeed ? Math.floor(Math.random() * 1e9) : sc.seed;
      city.regenerateWithScenario(seed, sc.config);
      network.resetAll();
      vehicleSystem.resetAll();
      cargoSystem.resetAll();
      network.refreshMeshes();
      ui.refreshRouteChips();
      ui.refreshHud();
      schematicView.markDirty();
      setSpeedButtons(1);
      hideStartMenu();
    });
  });
  grid.querySelectorAll('[data-export-scenario]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sc = scenarioList.find(s => s.id === btn.dataset.exportScenario);
      if (sc) exportScenario(sc);
    });
  });
  grid.querySelectorAll('[data-delete-scenario]').forEach(btn => {
    btn.addEventListener('click', () => { deleteCustomScenario(btn.dataset.deleteScenario); renderStartMenu(); });
  });
}

document.getElementById('start-import-scenario').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try { await importScenarioFromFile(file); renderStartMenu(); }
  catch (err) { ui.showToast(err.message); }
});

setSpeedButtons(0);
renderStartMenu();
