import { CARGO_TYPES } from './config.js';

// Freight equivalent of contracts.js: time-limited objectives from local
// businesses, layered on top of the freight sandbox. Same shape
// deliberately - checked once per sim-day, a met condition resolves
// immediately, a missed deadline resolves failure.

const MAX_ACTIVE = 2;
const GEN_CHANCE = 0.5;
let _idCounter = 1;

export class ShippingContractSystem {
  constructor({ cargoSystem, economy, ui }) {
    this.cargoSystem = cargoSystem;
    this.economy = economy;
    this.ui = ui;
    this.active = [];
    this.completedCount = 0;
  }

  onNewDay(day) {
    for (const c of [...this.active]) this._checkContract(c, day);
    if (this.active.length < MAX_ACTIVE && this.cargoSystem.depots.size > 0 && Math.random() < GEN_CHANCE) {
      this._generateContract(day);
    }
  }

  serialize() {
    return this.active.map(({ type, target, cargoTypeId, label, expiresAtDay, reward, penalty }) =>
      ({ type, target, cargoTypeId, label, expiresAtDay, reward, penalty }));
  }

  // Rebuilds the `check` closure per type (it can't be serialized directly).
  rehydrate(savedContracts) {
    this.active = (savedContracts || []).map(data => {
      const c = { ...data };
      if (c.type === 'freight_revenue') c.check = () => this.economy.totalFreightRevenue >= c.target;
      else if (c.type === 'shipments_delivered') c.check = () => this.cargoSystem.deliveredCount >= c.target;
      else if (c.type === 'cargo_type_tons') c.check = () => (this.cargoSystem.deliveredTonsByType[c.cargoTypeId] || 0) >= c.target;
      else c.check = () => false;
      return c;
    });
  }

  _generateContract(day) {
    const types = ['freight_revenue', 'shipments_delivered', 'cargo_type_tons'];
    const type = types[Math.floor(Math.random() * types.length)];

    if (type === 'freight_revenue') {
      const increment = 5000 + Math.floor(Math.random() * 8000);
      const target = Math.round(this.economy.totalFreightRevenue + increment);
      const days = 10 + Math.floor(Math.random() * 8);
      this._pushContract({
        type, target,
        label: `Earn $${increment.toLocaleString('en-US')} more in freight revenue within ${days} days`,
        expiresAtDay: day + days,
        reward: Math.round(increment * 1.8),
        penalty: Math.round(increment * 0.6),
        check: () => this.economy.totalFreightRevenue >= target,
      });
    } else if (type === 'shipments_delivered') {
      const increment = 3 + Math.floor(Math.random() * 6);
      const target = this.cargoSystem.deliveredCount + increment;
      const days = 8 + Math.floor(Math.random() * 7);
      this._pushContract({
        type, target,
        label: `Deliver ${increment} more shipments within ${days} days`,
        expiresAtDay: day + days,
        reward: 20000 + increment * 6000,
        penalty: 15000,
        check: () => this.cargoSystem.deliveredCount >= target,
      });
    } else {
      const cargoType = Object.values(CARGO_TYPES)[Math.floor(Math.random() * Object.values(CARGO_TYPES).length)];
      const increment = 15 + Math.floor(Math.random() * 30);
      const target = Math.round((this.cargoSystem.deliveredTonsByType[cargoType.id] || 0) + increment);
      const days = 10 + Math.floor(Math.random() * 8);
      this._pushContract({
        type, cargoTypeId: cargoType.id, target,
        label: `Deliver ${increment}t more of ${cargoType.icon} ${cargoType.label} within ${days} days`,
        expiresAtDay: day + days,
        reward: Math.round(increment * cargoType.valuePerTon * 2.2),
        penalty: Math.round(increment * cargoType.valuePerTon * 0.8),
        check: () => (this.cargoSystem.deliveredTonsByType[cargoType.id] || 0) >= target,
      });
    }
  }

  _pushContract(c) {
    c.id = `sct${_idCounter++}`;
    this.active.push(c);
    this.ui.showToast(`🚚 New shipping contract: ${c.label}`, true);
  }

  _checkContract(c, day) {
    if (c.check()) { this._resolve(c, true); return; }
    if (day >= c.expiresAtDay) this._resolve(c, false);
  }

  _resolve(c, success) {
    this.active = this.active.filter(x => x !== c);
    if (success) {
      this.economy.budget += c.reward;
      this.completedCount += 1;
      this.ui.showToast(`✅ Shipping contract complete: ${c.label} (+${Math.round(c.reward).toLocaleString('en-US')})`, true);
    } else {
      this.economy.budget -= c.penalty;
      this.ui.showToast(`❌ Shipping contract failed: ${c.label} (-${Math.round(c.penalty).toLocaleString('en-US')})`);
    }
  }
}
