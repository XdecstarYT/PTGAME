// City-council contracts: time-limited objectives layered on top of open
// sandbox play. Checked once per sim-day; a met condition resolves success
// immediately (even before the deadline), a missed deadline resolves failure.

const MAX_ACTIVE = 2;
const GEN_CHANCE = 0.5;
let _idCounter = 1;

function directionName(dx, dz) {
  const angle = Math.atan2(dz, dx) * 180 / Math.PI; // dz+ = south, dx+ = east
  const norm = ((angle % 360) + 360) % 360; // 0..360
  const names = ['East', 'Southeast', 'South', 'Southwest', 'West', 'Northwest', 'North', 'Northeast'];
  return names[Math.round(norm / 45) % 8];
}

export class ContractSystem {
  constructor({ city, network, economy, passengerSystem, ui }) {
    this.city = city;
    this.network = network;
    this.economy = economy;
    this.passengerSystem = passengerSystem;
    this.ui = ui;
    this.active = [];
    this.completedCount = 0;
  }

  onNewDay(day) {
    for (const c of [...this.active]) this._checkContract(c, day);
    if (this.active.length < MAX_ACTIVE && Math.random() < GEN_CHANCE) this._generateContract(day);
  }

  serialize() {
    return this.active.map(({ type, target, blockId, direction, label, expiresAtDay, reward, penalty }) =>
      ({ type, target, blockId, direction, label, expiresAtDay, reward, penalty }));
  }

  // Rebuilds the `check` closure per type (it can't be serialized directly).
  rehydrate(savedContracts) {
    this.active = (savedContracts || []).map(data => {
      const c = { ...data };
      if (c.type === 'coverage') c.check = () => Math.round(this.network.coveragePercent() * 100) >= c.target;
      else if (c.type === 'satisfaction') c.check = () => Math.round(this.passengerSystem.citySatisfaction) >= c.target;
      else if (c.type === 'connect') {
        const block = this.city.blocks.get(c.blockId);
        c.check = () => (block ? this._isConnectedToDowntown(block) : false);
      } else {
        c.check = () => false;
      }
      return c;
    });
  }

  _generateContract(day) {
    const coverage = this.network.coveragePercent();
    const satisfaction = this.passengerSystem.citySatisfaction;
    const types = ['coverage', 'satisfaction'];
    if (this._pickRemoteBlock()) types.push('connect');
    const type = types[Math.floor(Math.random() * types.length)];

    if (type === 'coverage') {
      const target = Math.min(90, Math.round(coverage * 100) + 15 + Math.floor(Math.random() * 10));
      const days = 10 + Math.floor(Math.random() * 8);
      this._pushContract({
        type, target,
        label: `Reach ${target}% network coverage within ${days} days`,
        expiresAtDay: day + days,
        reward: 150000 + target * 1000,
        penalty: 60000,
        check: () => Math.round(this.network.coveragePercent() * 100) >= target,
      });
    } else if (type === 'satisfaction') {
      const target = Math.min(92, Math.round(satisfaction) + 8 + Math.floor(Math.random() * 8));
      const days = 7 + Math.floor(Math.random() * 7);
      this._pushContract({
        type, target,
        label: `Hit ${target}% citywide satisfaction within ${days} days`,
        expiresAtDay: day + days,
        reward: 120000 + target * 1000,
        penalty: 50000,
        check: () => Math.round(this.passengerSystem.citySatisfaction) >= target,
      });
    } else {
      const block = this._pickRemoteBlock();
      const dir = directionName(block.bx - this._centerBx(), block.bz - this._centerBz());
      const days = 14 + Math.floor(Math.random() * 10);
      this._pushContract({
        type, blockId: block.id, direction: dir,
        label: `Connect the ${dir} district to downtown within ${days} days`,
        expiresAtDay: day + days,
        reward: 200000,
        penalty: 80000,
        check: () => this._isConnectedToDowntown(block),
      });
    }
  }

  _pushContract(c) {
    c.id = `ct${_idCounter++}`;
    this.active.push(c);
    this.ui.showToast(`📜 New council contract: ${c.label}`, true);
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
      this.ui.showToast(`✅ Contract complete: ${c.label} (+${Math.round(c.reward).toLocaleString('en-US')})`, true);
    } else {
      this.economy.budget -= c.penalty;
      this.ui.showToast(`❌ Contract failed: ${c.label} (-${Math.round(c.penalty).toLocaleString('en-US')})`);
    }
  }

  _centerBx() { return (Math.ceil(this.city.size / 4) - 1) / 2; }
  _centerBz() { return this._centerBx(); }

  _pickRemoteBlock() {
    const blocks = [...this.city.blocks.values()].filter(b => b.unlocked && b.dist > 2.2);
    if (!blocks.length) return null;
    return blocks[Math.floor(Math.random() * blocks.length)];
  }

  _downtownBlock() {
    return [...this.city.blocks.values()].reduce((best, b) => (b.dist < best.dist ? b : best));
  }

  // BFS over the committed route graph: is there a transit path connecting a
  // station near the target block to a station near downtown?
  _isConnectedToDowntown(block) {
    const targetTiles = block.tiles;
    const downtown = this._downtownBlock();
    const nearBlock = (tile, stations) => stations.filter(s => Math.hypot(s.worldX - tile.worldX, s.worldZ - tile.worldZ) <= s.radius);

    const stations = [...this.network.stations.values()];
    const startStations = new Set();
    for (const t of targetTiles) for (const s of nearBlock(t, stations)) startStations.add(s.id);
    const goalStations = new Set();
    for (const t of downtown.tiles) for (const s of nearBlock(t, stations)) goalStations.add(s.id);
    if (!startStations.size || !goalStations.size) return false;

    const adj = new Map();
    for (const e of this.network.getRouteEdges()) {
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from).push(e.to);
    }
    const visited = new Set(startStations);
    const queue = [...startStations];
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      if (goalStations.has(cur)) return true;
      for (const nb of adj.get(cur) || []) {
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
      }
    }
    return [...visited].some(id => goalStations.has(id));
  }
}
