// A cheap "social feed" ticker: rotates a short generated headline every few
// seconds, sourced from live satisfaction/crowding/congestion/lost-demand
// data so it reads as an at-a-glance emotional pulse on the network.
export class NewsTicker {
  constructor({ el, network, economy, passengerSystem, vehicleSystem, catalog }) {
    this.el = el;
    this.network = network;
    this.economy = economy;
    this.passengerSystem = passengerSystem;
    this.vehicleSystem = vehicleSystem;
    this.catalog = catalog;
    this._timer = 0;
    this._intervalMs = 7000;
    this._show(this._pickMessage());
  }

  update(dtMs) {
    this._timer += dtMs;
    if (this._timer >= this._intervalMs) {
      this._timer = 0;
      this._show(this._pickMessage());
    }
  }

  _show(msg) {
    if (!msg || !this.el) return;
    this.el.classList.remove('ticker-fade');
    void this.el.offsetWidth; // restart the CSS animation
    this.el.textContent = msg;
    this.el.classList.add('ticker-fade');
  }

  _pickMessage() {
    const pools = [];

    for (const v of this.vehicleSystem.vehicles.values()) {
      const load = v.passengers.length / Math.max(1, v.capacity);
      const route = this.network.routes.get(v.routeId);
      if (route && load > 0.85) pools.push(`"${route.name} packed again this morning," a commuter posts.`);
      if (v.brokenDown) pools.push(`Riders on ${route?.name || 'a line'} report a stalled vehicle - "so annoying," one writes.`);
    }

    for (const route of this.network.routes.values()) {
      if (!route.committed || !route.vehicleStats) continue;
      const model = this.catalog.get(route.modelId);
      if (route.vehicleStats.comfortScore > 85) pools.push(`"The new ${model?.name || 'vehicle'} on ${route.name} is so smooth!" - a rider.`);
      if (route.strikeActive) pools.push(`Commuters fuming as ${route.name} sits idle during the strike.`);
    }

    const sat = this.passengerSystem.citySatisfaction;
    if (sat > 82) pools.push('"Service has never been better," a rider tells the Herald.');
    else if (sat < 40) pools.push('Riders are venting about long waits across the network.');

    if (this.economy.lostDemandToday > 25) pools.push('Frustrated commuters say they gave up on transit entirely today.');
    if (this.economy.congestion > 65) pools.push('Traffic reporters warn of gridlock building near downtown.');
    else if (this.economy.congestion < 15 && this.network.stations.size > 0) pools.push('Roads are unusually clear this week, commuters report.');

    if (this.economy.fuelPriceMultiplier > 1) pools.push('Commuters ask if fare hikes are coming after the fuel price spike.');
    if (this.economy.subsidyMultiplier < 1) pools.push('Advocacy groups criticize the city council over the subsidy cut.');

    if (!pools.length) pools.push('The city hums along quietly today.');
    return pools[Math.floor(Math.random() * pools.length)];
  }
}
