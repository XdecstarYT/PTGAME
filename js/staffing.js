const HIRE_DRIVER_COST = 8000;
const HIRE_MECHANIC_COST = 12000;
const TRAIN_COST = 20000;

// A deliberately lightweight staffing layer: a headcount and a morale dial,
// not a full HR sim. Understaffing/low morale raises breakdown risk and
// stretches how long a breakdown/strike takes to resolve.
export class Staffing {
  constructor(economy) {
    this.economy = economy;
    this.drivers = 4;
    this.mechanics = 2;
    this.morale = 70;
  }

  requiredDrivers(network) {
    let total = 0;
    for (const r of network.routes.values()) if (r.committed) total += r.frequency;
    return Math.max(1, total);
  }

  requiredMechanics(network) { return Math.max(1, Math.ceil(this.requiredDrivers(network) / 4)); }

  onNewDay(network) {
    const req = this.requiredDrivers(network);
    const ratio = this.drivers / req;
    if (ratio < 1) this.morale = Math.max(0, this.morale - (1 - ratio) * 15);
    else if (ratio > 1.15) this.morale = Math.min(100, this.morale + 2);
    else this.morale = Math.min(100, this.morale + 0.5);
  }

  hireDriver() {
    if (!this.economy.canAfford(HIRE_DRIVER_COST)) return false;
    this.economy.spend(HIRE_DRIVER_COST);
    this.drivers += 1;
    return true;
  }

  hireMechanic() {
    if (!this.economy.canAfford(HIRE_MECHANIC_COST)) return false;
    this.economy.spend(HIRE_MECHANIC_COST);
    this.mechanics += 1;
    return true;
  }

  train() {
    if (!this.economy.canAfford(TRAIN_COST)) return false;
    this.economy.spend(TRAIN_COST);
    this.morale = Math.min(100, this.morale + 15);
    return true;
  }

  // >1 when morale is low - used by events.js to weight breakdown odds/duration.
  breakdownWeightMultiplier() { return 1 + Math.max(0, (60 - this.morale)) / 60; }

  get hireDriverCost() { return HIRE_DRIVER_COST; }
  get hireMechanicCost() { return HIRE_MECHANIC_COST; }
  get trainCost() { return TRAIN_COST; }
}
