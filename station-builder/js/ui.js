import { SIZE_TIERS, STATION_TYPES, INTERIOR_OBJECTS, ARCHITECTURE_STYLES } from './config.js';
import { computeStats } from './statEngine.js';
import { tierUpgradePlan } from './upgrades.js';
import { saveTemplate, templatesForType, applyTemplate, deleteTemplate, templateFits } from './templates.js';

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
      styleList: document.getElementById('style-list'),
      rotateBtn: document.getElementById('btn-rotate'),
      costLabel: document.getElementById('cost-label'),
      toastContainer: document.getElementById('toast-container'),
      stationCount: document.getElementById('stat-station-count'),
      editorOverlay: document.getElementById('editor-overlay'),
      editorStationName: document.getElementById('editor-station-name'),
      editorLevelTabs: document.getElementById('editor-level-tabs'),
      editorPalette: document.getElementById('editor-palette'),
      paletteList: document.getElementById('palette-list'),
      editorStats: document.getElementById('editor-stats'),
      btnEditorBack: document.getElementById('btn-editor-back'),
      walkHud: document.getElementById('walkmode-hud'),
      btnUpgradeTier: document.getElementById('btn-upgrade-tier'),
      btnSaveTemplate: document.getElementById('btn-save-template'),
      btnLoadTemplate: document.getElementById('btn-load-template'),
      galleryOverlay: document.getElementById('template-gallery-overlay'),
      galleryGrid: document.getElementById('template-gallery-grid'),
      galleryEmpty: document.getElementById('template-gallery-empty'),
      btnGalleryClose: document.getElementById('btn-gallery-close'),
      nameModal: document.getElementById('template-name-modal'),
      nameInput: document.getElementById('template-name-input'),
      btnNameCancel: document.getElementById('btn-template-name-cancel'),
      btnNameSave: document.getElementById('btn-template-name-save'),
    };

    this._renderTypePicker();
    this._renderTierPicker();
    this._renderStylePicker();
    this.dom.rotateBtn.addEventListener('click', () => {
      this.placement.toggleRotate();
      this.refresh();
    });
    this.dom.btnUpgradeTier.addEventListener('click', () => this._onUpgradeClick());
    this.dom.btnSaveTemplate.addEventListener('click', () => this._openSaveTemplateModal());
    this.dom.btnLoadTemplate.addEventListener('click', () => this._openGallery());
    this.dom.btnGalleryClose.addEventListener('click', () => this._closeGallery());
    this.dom.btnNameCancel.addEventListener('click', () => this._closeSaveTemplateModal());
    this.dom.btnNameSave.addEventListener('click', () => this._confirmSaveTemplate());
    this.dom.nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._confirmSaveTemplate();
      if (e.key === 'Escape') this._closeSaveTemplateModal();
    });

    this.refresh();
  }

  _onUpgradeClick() {
    const station = this._currentStation;
    if (!station) return;
    const result = this.placement.upgradeStation(station);
    if (!result.ok) { this.showToast(result.reason, true); return; }
    this.showToast(`Upgraded to ${result.newTierName} (${fmtMoney(result.cost)})`);
    this._currentLayoutEditor?.render();
    this._renderLevelTabs(station, this._currentLayoutEditor);
    this.refreshEditorStats(station);
  }

  _refreshUpgradeButton(station) {
    const plan = tierUpgradePlan(station);
    if (!plan) { this.dom.btnUpgradeTier.classList.add('hidden'); return; }
    this.dom.btnUpgradeTier.classList.remove('hidden');
    this.dom.btnUpgradeTier.textContent = `⬆️ Upgrade to ${plan.next.name} (${fmtMoney(plan.cost)})`;
    this.dom.btnUpgradeTier.disabled = this.economy.budget < plan.cost;
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

  _renderStylePicker() {
    this.dom.styleList.innerHTML = '';
    for (const style of ARCHITECTURE_STYLES) {
      const btn = el(`<button class="picker-btn" data-style="${style.id}" title="${style.name}">
        <span class="picker-icon">${style.icon}</span><span>${style.name}</span>
      </button>`);
      btn.addEventListener('click', () => { this.placement.setStyle(style.id); this.refresh(); });
      this.dom.styleList.appendChild(btn);
    }
  }

  refresh() {
    this.dom.typeList.querySelectorAll('[data-type]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.type === this.placement.typeId);
    });
    this.dom.tierList.querySelectorAll('[data-tier]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tier === this.placement.tierId);
    });
    this.dom.styleList.querySelectorAll('[data-style]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.style === this.placement.styleId);
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
    this._currentStation = station;
    this._currentLayoutEditor = layoutEditor;
    this.dom.editorOverlay.classList.remove('hidden');
    this.dom.editorStationName.textContent = `${station.name} (${STATION_TYPES.find(t => t.id === station.typeId).name})`;
    this._renderPalette(layoutEditor);
    this._renderLevelTabs(station, layoutEditor);
    this.refreshEditorStats(station);
  }

  hideEditor() {
    this.dom.editorOverlay.classList.add('hidden');
  }

  showWalkHud() { this.dom.walkHud.classList.remove('hidden'); }
  hideWalkHud() { this.dom.walkHud.classList.add('hidden'); }

  _renderPalette(layoutEditor) {
    this.dom.paletteList.innerHTML = '';
    for (const obj of INTERIOR_OBJECTS) {
      const btn = el(`<button class="palette-btn" data-obj="${obj.id}" title="${obj.name}">
        <span class="palette-swatch" style="background:${obj.color}"></span>
        <span class="palette-icon">${obj.icon}</span>
        <span class="palette-name">${obj.name}</span>
        <span class="palette-cost">${obj.cost ? '$' + obj.cost.toLocaleString() : ''}</span>
      </button>`);
      btn.addEventListener('click', () => {
        layoutEditor.setBrush(obj.id);
        this.dom.paletteList.querySelectorAll('[data-obj]').forEach(b => b.classList.toggle('active', b.dataset.obj === obj.id));
      });
      if (obj.id === layoutEditor.brush) btn.classList.add('active');
      this.dom.paletteList.appendChild(btn);
    }
  }

  // ---------------- templates & gallery (Phase 6) ----------------

  _openSaveTemplateModal() {
    if (!this._currentStation) return;
    this.dom.nameInput.value = this._currentStation.name;
    this.dom.nameModal.classList.remove('hidden');
    this.dom.nameInput.focus();
    this.dom.nameInput.select();
  }

  _closeSaveTemplateModal() {
    this.dom.nameModal.classList.add('hidden');
  }

  _confirmSaveTemplate() {
    const station = this._currentStation;
    if (!station) return;
    saveTemplate(this.dom.nameInput.value.trim(), station);
    this._closeSaveTemplateModal();
    this.showToast(`Saved "${this.dom.nameInput.value.trim() || station.name}" as a template.`);
  }

  _openGallery() {
    if (!this._currentStation) return;
    this._renderGallery();
    this.dom.galleryOverlay.classList.remove('hidden');
  }

  _closeGallery() {
    this.dom.galleryOverlay.classList.add('hidden');
  }

  _renderThumbnail(canvas, grid) {
    const ctx = canvas.getContext('2d');
    const rows = grid.length, cols = grid[0].length;
    const cellPx = Math.min(canvas.width / cols, canvas.height / rows);
    const offX = (canvas.width - cols * cellPx) / 2;
    const offY = (canvas.height - rows * cellPx) / 2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const obj = INTERIOR_OBJECTS.find(o => o.id === grid[r][c]) || INTERIOR_OBJECTS[0];
        ctx.fillStyle = obj.color;
        ctx.fillRect(offX + c * cellPx, offY + r * cellPx, cellPx + 0.5, cellPx + 0.5);
      }
    }
  }

  _renderGallery() {
    const station = this._currentStation;
    const templates = templatesForType(station.typeId).sort((a, b) => b.createdAt - a.createdAt);
    this.dom.galleryEmpty.classList.toggle('hidden', templates.length > 0);
    this.dom.galleryGrid.innerHTML = '';

    for (const template of templates) {
      const tier = SIZE_TIERS.find(t => t.id === template.tierId);
      const fits = templateFits(template, station);
      const stats = computeStats({
        typeId: template.typeId, tierId: template.tierId,
        w: template.w, d: template.d, levels: template.levels,
      });
      const card = el(`<div class="template-card">
        <canvas class="template-thumb" width="200" height="80"></canvas>
        <div class="template-name">${template.name}</div>
        <div class="template-sub">${tier ? tier.name : template.tierId} · ${template.w}×${template.d} · ${template.levels.length} level${template.levels.length > 1 ? 's' : ''}</div>
        <div class="template-stat">Capacity: ${stats.capacity}/hr</div>
        <div class="template-card-actions">
          <button class="action-btn small apply-btn"${fits ? '' : ' disabled'}>${fits ? '✅ Apply' : '📐 Size mismatch'}</button>
          <button class="action-btn small delete-btn">🗑️</button>
        </div>
      </div>`);
      this._renderThumbnail(card.querySelector('.template-thumb'), template.levels[0].grid);
      card.querySelector('.apply-btn').addEventListener('click', () => this._applyTemplateCard(template));
      card.querySelector('.delete-btn').addEventListener('click', () => {
        deleteTemplate(template.id);
        this._renderGallery();
      });
      this.dom.galleryGrid.appendChild(card);
    }
  }

  _applyTemplateCard(template) {
    const station = this._currentStation;
    const result = applyTemplate(template, station, this.economy);
    if (!result.ok) { this.showToast(result.reason, true); return; }
    this._closeGallery();
    this._currentLayoutEditor?.render();
    this._renderLevelTabs(station, this._currentLayoutEditor);
    this.refreshEditorStats(station);
    const costNote = result.cost > 0 ? ` (${fmtMoney(result.cost)})` : '';
    this.showToast(`Applied template "${template.name}"${costNote}.`);
    if (result.levelsSkipped > 0) {
      this.showToast(`${result.levelsSkipped} level(s) from the template weren't applied - add more levels to this station first.`, true);
    }
  }

  _renderLevelTabs(station, layoutEditor) {
    this.dom.editorLevelTabs.innerHTML = '';
    const isInterchange = station.typeId === 'interchange';
    station.levels.forEach((level, i) => {
      const wrap = el('<div class="level-tab-wrap"></div>');
      const tab = el(`<button class="level-tab${i === layoutEditor.activeLevel ? ' active' : ''}">${level.name}</button>`);
      tab.addEventListener('click', () => {
        layoutEditor.setActiveLevel(i);
        this._renderLevelTabs(station, layoutEditor);
        this.refreshEditorStats(station);
      });
      wrap.appendChild(tab);

      if (isInterchange) {
        const select = el('<select class="level-mode-select"></select>');
        for (const type of STATION_TYPES) {
          const opt = el(`<option value="${type.id}">${type.icon} ${type.name}</option>`);
          if ((level.servedType || station.typeId) === type.id) opt.setAttribute('selected', 'selected');
          select.appendChild(opt);
        }
        select.addEventListener('change', () => {
          layoutEditor.setLevelServedType(i, select.value);
          this.refreshEditorStats(station);
        });
        select.addEventListener('click', (e) => e.stopPropagation());
        wrap.appendChild(select);
      }
      this.dom.editorLevelTabs.appendChild(wrap);
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
    this._refreshUpgradeButton(station);
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
