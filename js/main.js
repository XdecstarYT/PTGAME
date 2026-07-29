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

const canvas = document.getElementById('viewport');
const sceneManager = new SceneManager(canvas);

const city = new City();
city.buildMeshes(sceneManager.scene);

const catalog = new Catalog();

const network = new Network(city, catalog);
network.buildMeshes(sceneManager.scene);

const vehicleSystem = new VehicleSystem(network, catalog);
vehicleSystem.buildMeshes(sceneManager.scene);

const economy = new Economy();
const passengerSystem = new PassengerSystem(city, network, economy, vehicleSystem);
passengerSystem.buildMeshes(sceneManager.scene);

const timeSystem = new TimeSystem();

const ui = new UIController({ sceneManager, city, network, vehicleSystem, passengerSystem, economy, timeSystem, catalog });

const schematicView = new SchematicView({
  canvas: document.getElementById('schematic'),
  city, network, vehicleSystem,
  onTileClick: (x, z) => ui.handleWorldTileClick(x, z),
});
ui.setSchematicView(schematicView);

const vehicleDesigner = new VehicleDesigner({ catalog, network, economy, ui });
ui.setVehicleDesigner(vehicleDesigner);
document.getElementById('btn-design-vehicle').addEventListener('click', () => vehicleDesigner.open());

sceneManager.setTimeOfDay(timeSystem.hour);
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
  sceneManager.setTimeOfDay(hour);
});

let pendingUnlockNotes = [];

timeSystem.on('newDay', (newDay) => {
  const endedDay = newDay - 1;
  const satisfaction = passengerSystem.citySatisfaction;
  const coverage = network.coveragePercent();
  economy.applyDailyCosts(network);
  economy.closeDay(endedDay, satisfaction, coverage);

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

  hudAccum += dt;
  if (hudAccum > 400) {
    hudAccum = 0;
    ui.refreshHud();
    ui.refreshOpenPanel();
  }
}
requestAnimationFrame(animate);
