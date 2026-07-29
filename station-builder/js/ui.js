import { SIZE_TIERS, STATION_TYPES, INTERIOR_OBJECTS } from './config.js';
import { computeStats } from './statEngine.js';

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function fmtMoney(n) { return `$${Math.round(n).toLocaleString()}`; }

// Toolbar (station type + tier pickers, rotate), budget/hint HUD, and toasts
// for the placement phase. Later phases add their own panels but reuse
// showToast/updateBudget from here.
export class UI {
  constructor({ placement, economy }) {
    this.placement = placement;
    this.economy = economy;

    this.dom = {
      budget: document.getElementById('stat-budget'),
      hint: document.getElementById('hint-banner'),
      typeList: document.getElementById('type-list'),
      tierList: document.getElementById('tier-list'),
      rotateBtn: document.getElementById('btn-rotate'),
      costLabel: document.getElementById('cost-label'),
      toastContainer: document.getElementById('toast-container'),
      stationCount: document.getElementById('stat-station-count'),
      editorOverlay: document.getElementById('editor-overlay'),
      editorStationName: document.getElementById('editor-station-name'),
      editorLevelTabs: document.getElementById('editor-level-tabs'),
      editorPalette: document.getElementById('editor-palette'),
      editorStats: document.getElementById('editor-stats'),
      btnEditorBack: document.getElementById('btn-editor-back'),
    };

    this._renderTypePicker();
    this._renderTierPicker();
    this.dom.rotateBtn.addEventListener('click', () => {
      this.placement.toggleRotate();
      this.refresh();
    });

    this.refresh();
  }

  _renderTypePicker() {
    this.dom.typeList.innerHTML = '';
    for (const type of STATION_TYPES) {
      const btn = el(`<button class="picker-btn" data-type="${type.id}" title="${type.name}">
        <span class="picker-icon">${type.icon}</span><span>${type.name}</span>
      </button>`);
      btn.addEventListener('click', () => { this.placement.setType(type.id); this.refresh(); });
      this.dom.typeList.appendChild(btn);
    }
  }

  _renderTierPicker() {
    this.dom.tierList.innerHTML = '';
    for (const tier of SIZE_TIERS) {
      const btn = el(`<button class="picker-btn" data-tier="${tier.id}" title="${tier.name}">
        <span>${tier.name}</span><span class="picker-sub">${tier.w}×${tier.d} cells</span>
      </button>`);
      btn.addEventListener('click', () => { this.placement.setTier(tier.id); this.refresh(); });
      this.dom.tierList.appendChild(btn);
    }
  }

  refresh() {
    this.dom.typeList.querySelectorAll('[data-type]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === this.placement.typeId);
    });
    this.dom.tierList.querySelectorAll('[data-tier]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tier === this.placement.tierId);
    });
    this.updateBudget();
    const cost = this.placement.currentCost();
    const afford = this.placement.canAffordCurrent();
    this.dom.costLabel.textContent = `Cost: ${fmtMoney(cost)}`;
    this.dom.costLabel.classList.toggle('cost-bad', !afford);
    this.dom.stationCount.textContent = this.placement.stations.length;
  }

  updateBudget() {
    this.dom.budget.textContent = fmtMoney(this.economy.budget);
  }

  setHint(text) { this.dom.hint.textContent = text; }

  showToast(message, warn = false) {
    const toast = el(`<div class="toast${warn ? ' warn' : ''}">${message}</div>`);
    this.dom.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // ---------------- layout editor panel ----------------

  showEditor(station, layoutEditor) {
    this.dom.editorOverlay.classList.remove('hidden');
    this.dom.editorStationName.textContent = `${station.name} (${STATION_TYPES.find(t => t.id === station.typeId).name})`;
    this._renderPalette(layoutEditor);
    this._renderLevelTabs(station, layoutEditor);
    this.refreshEditorStats(station);
  }

  hideEditor() {
    this.dom.editorOverlay.classList.add('hidden');
  }

  _renderPalette(layoutEditor) {
    this.dom.editorPalette.innerHTML = '<h3>Place</h3>';
    for (const obj of INTERIOR_OBJECTS) {
      const btn = el(`<button class="palette-btn" data-obj="${obj.id}" title="${obj.name}">
        <span class="palette-swatch" style="background:${obj.color}"></span>
        <span class="palette-icon">${obj.icon}</span>
        <span class="palette-name">${obj.name}</span>
        <span class="palette-cost">${obj.cost ? '$' + obj.cost.toLocaleString() : ''}</span>
      </button>`);
      btn.addEventListener('click', () => {
        layoutEditor.setBrush(obj.id);
        this.dom.editorPalette.querySelectorAll('[data-obj]').forEach(b => b.classList.toggle('active', b.dataset.obj === obj.id));
      });
      if (obj.id === layoutEditor.brush) btn.classList.add('active');
      this.dom.editorPalette.appendChild(btn);
    }
  }

  _renderLevelTabs(station, layoutEditor) {
    this.dom.editorLevelTabs.innerHTML = '';
    station.levels.forEach((level, i) => {
      const tab = el(`<button class="level-tab${i === layoutEditor.activeLevel ? ' active' : ''}">${level.name}</button>`);
      tab.addEventListener('click', () => {
        layoutEditor.setActiveLevel(i);
        this._renderLevelTabs(station, layoutEditor);
        this.refreshEditorStats(station);
      });
      this.dom.editorLevelTabs.appendChild(tab);
    });
    if (layoutEditor.canAddLevel()) {
      const cost = layoutEditor.levelAddCost();
      const addBtn = el(`<button class="level-tab add-level">+ Add Level ($${cost.toLocaleString()})</button>`);
      addBtn.addEventListener('click', () => {
        const result = layoutEditor.addLevel();
        if (!result.ok) { this.showToast(result.reason, true); return; }
        this._renderLevelTabs(station, layoutEditor);
        this.refreshEditorStats(station);
      });
      this.dom.editorLevelTabs.appendChild(addBtn);
    }
  }

  refreshEditorStats(station) {
    this.updateBudget();
    const s = computeStats(station);
    const row = (label, val, cls = '') => `<div class="stat-row"><span>${label}</span><span class="stat-val ${cls}">${val}</span></div>`;
    let html = '<h3>Live Stats</h3>';
    html += row('Capacity (pax/hr)', `${s.capacity} / ${s.targetThroughput} target`, s.capacity >= s.targetThroughput ? 'good' : '');
    html += row('Congestion risk', `${s.congestionRisk}%`, s.congestionRisk > 40 ? 'bad' : (s.congestionRisk > 0 ? '' : 'good'));
    html += row('Accessibility', `${s.accessibilityRating}%`, s.accessibilityCompliant ? 'good' : 'bad');
    html += row('Entrances', `${s.entranceCount} / ${s.minEntrances} min`, s.entranceCount >= s.minEntrances ? 'good' : 'bad');
    html += row('Platform length', `${s.platformLength}m / ${s.requiredPlatformLength}m`, s.platformLengthOk ? 'good' : 'bad');
    html += row('Dwell/transfer est.', `${s.dwellTimeMin} min`);
    html += row('Interior spend', fmtMoney(s.interiorCost));
    if (s.warnings.length) {
      html += '<div class="warning-list">' + s.warnings.map(w => `<div class="warning-item">⚠️ ${w}</div>`).join('') + '</div>';
    }
    this.dom.editorStats.innerHTML = html;
  }
}
