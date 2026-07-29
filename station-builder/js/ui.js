import { SIZE_TIERS, STATION_TYPES } from './config.js';

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
}
