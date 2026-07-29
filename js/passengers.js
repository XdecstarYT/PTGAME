import * as THREE from 'three';
import { WALK_SPEED, MAX_ACCEPTABLE_TRIP_MINUTES, MAX_TRANSFERS } from './config.js';
import { TimeSystem } from './time.js';

let _pId = 1;
const BASE_SPAWN_RATE = 0.00045; // trips per person per sim-minute at peak demand multiplier
const ABANDON_AFTER_MINUTES = 240; // safety net: gives up (counts as lost demand) if stuck this long

function pickWeighted(rng, candidates, weightFn) {
  let total = 0;
  const weights = new Array(candidates.length);
  for (let i = 0; i < candidates.length; i++) {
    const w = Math.max(0, weightFn(candidates[i]));
    weights[i] = w;
    total += w;
  }
  if (total <= 0) return null;
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

// Multi-source, transfer-aware Dijkstra over the station graph.
// State = `${stationId}|${lastRouteId||'-'}` so continuing on the same
// vehicle is free while switching lines pays a headway-based wait penalty.
function planTrip(network, originTile, destTile) {
  const allStations = [...network.stations.values()];
  const originStations = allStations.filter(s => Math.hypot(s.worldX - originTile.worldX, s.worldZ - originTile.worldZ) <= s.radius);
  const destStations = allStations.filter(s => Math.hypot(s.worldX - destTile.worldX, s.worldZ - destTile.worldZ) <= s.radius);
  if (!originStations.length || !destStations.length) return null;

  const destSet = new Set(destStations.map(s => s.id));
  const edges = network.getRouteEdges();
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e);
  }
  const headwayCache = new Map();
  const headway = (route) => {
    if (!headwayCache.has(route.id)) headwayCache.set(route.id, network.headwayMinutes(route));
    return headwayCache.get(route.id);
  };

  const dist = new Map();
  const prev = new Map();
  const visited = new Set();
  const frontier = []; // {key, stationId, routeId, cost}

  for (const s of originStations) {
    const walkMin = (Math.sqrt((s.worldX - originTile.worldX) ** 2 + (s.worldZ - originTile.worldZ) ** 2)) / WALK_SPEED;
    const key = `${s.id}|-`;
    if (!dist.has(key) || walkMin < dist.get(key)) {
      dist.set(key, walkMin);
      frontier.push({ key, stationId: s.id, routeId: null, cost: walkMin });
    }
  }

  let best = null;
  while (frontier.length) {
    // linear-scan extract-min: graphs here are tiny, so this stays cheap
    let bi = 0;
    for (let i = 1; i < frontier.length; i++) if (frontier[i].cost < frontier[bi].cost) bi = i;
    const cur = frontier.splice(bi, 1)[0];
    if (visited.has(cur.key)) continue;
    visited.add(cur.key);
    if (cur.cost > MAX_ACCEPTABLE_TRIP_MINUTES) continue;

    if (destSet.has(cur.stationId)) {
      const s = network.stations.get(cur.stationId);
      const walkOut = (Math.sqrt((s.worldX - destTile.worldX) ** 2 + (s.worldZ - destTile.worldZ) ** 2)) / WALK_SPEED;
      const total = cur.cost + walkOut;
      if (total <= MAX_ACCEPTABLE_TRIP_MINUTES && (!best || total < best.total)) {
        best = { total, key: cur.key, walkOut };
      }
    }

    const outgoing = adj.get(cur.stationId) || [];
    for (const edge of outgoing) {
      const sameRoute = edge.routeId === cur.routeId;
      const route = network.routes.get(edge.routeId);
      if (!route) continue;
      let transferCount = cur.transfers || 0;
      let addCost = edge.minutes;
      if (!sameRoute) {
        addCost += headway(route) / 2;
        if (cur.routeId !== null) transferCount += 1;
      }
      if (transferCount > MAX_TRANSFERS) continue;
      const newCost = cur.cost + addCost;
      const key = `${edge.to}|${edge.routeId}`;
      if (!dist.has(key) || newCost < dist.get(key) - 1e-9) {
        dist.set(key, newCost);
        prev.set(key, { fromKey: cur.key, edge });
        frontier.push({ key, stationId: edge.to, routeId: edge.routeId, cost: newCost, transfers: transferCount });
      }
    }
  }

  if (!best) return null;

  // reconstruct leg sequence
  const legs = [];
  let k = best.key;
  while (prev.has(k)) {
    const { fromKey, edge } = prev.get(k);
    legs.push(edge);
    k = fromKey;
  }
  legs.reverse();

  const firstStationId = k.split('|')[0];
  const originStation = network.stations.get(firstStationId);
  const walkInMinutes = dist.get(k);

  // collapse consecutive same-route edges into ride legs (board once, ride N stops)
  const rideLegs = [];
  for (const e of legs) {
    const last = rideLegs[rideLegs.length - 1];
    if (last && last.routeId === e.routeId && last.alightStationId === e.from) {
      last.alightStationId = e.to;
      last.minutes += e.minutes;
    } else {
      rideLegs.push({ routeId: e.routeId, boardStationId: e.from, alightStationId: e.to, minutes: e.minutes });
    }
  }

  return {
    originStationId: originStation.id,
    walkInMinutes,
    rideLegs,
    walkOutMinutes: best.walkOut,
    totalMinutes: best.total,
  };
}

export class PassengerSystem {
  constructor(city, network, economy, vehicleSystem) {
    this.city = city;
    this.network = network;
    this.economy = economy;
    this.vehicleSystem = vehicleSystem;
    this.passengers = new Map();
    this._spawnAccum = new Map();
    this.satisfactionSamples = [];
    this.citySatisfaction = 78;
    this.congestion = 0; // rolling car-fallback pressure, 0-100
    this._group = null;
    this._maxWaitingInstances = 700;

    vehicleSystem.on('arrive', (evt) => this._handleArrival(evt));
  }

  buildMeshes(scene) {
    const geo = new THREE.CapsuleGeometry(0.35, 0.6, 3, 6);
    const mat = new THREE.MeshStandardMaterial({ color: 0xfff0d8 });
    this._mesh = new THREE.InstancedMesh(geo, mat, this._maxWaitingInstances);
    this._mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this._mesh);
    this._group = scene;
  }

  spawnPassenger(originTile, destTile, hour) {
    const plan = planTrip(this.network, originTile, destTile);
    const id = `p${_pId++}`;
    const passenger = {
      id, originTile, destTile, spawnHour: hour,
      transfers: 0, totalWaitMinutes: 0, crowdingMisses: 0,
      routesUsed: [],
    };

    if (!plan) {
      // no transit path at all: 50/50 lost demand vs. car
      if (Math.random() < 0.5) this.economy.recordLostDemand();
      else { this.economy.recordCarTrip(); this.congestion = Math.min(100, this.congestion + 0.15); }
      return;
    }
    if (plan.rideLegs.length === 0) {
      // origin and destination both fall within one station's catchment - a
      // plain walk, not a transit trip. Doesn't touch the network at all.
      return;
    }
    if (plan.totalMinutes > MAX_ACCEPTABLE_TRIP_MINUTES * 0.92) {
      if (Math.random() < 0.5) { this.economy.recordLostDemand(); return; }
      this.economy.recordCarTrip();
      this.congestion = Math.min(100, this.congestion + 0.1);
      return;
    }

    passenger.plan = plan;
    passenger.legIndex = -1; // -1 = walking to first station
    passenger.state = 'walking_to_station';
    passenger.walkRemaining = plan.walkInMinutes;
    passenger.currentStationId = null;
    passenger.bornAt = this._now || 0;
    this.passengers.set(id, passenger);
  }

  // Safety net for passengers whose plan went stale mid-trip (e.g. the player
  // deleted a station or route they were relying on) so they don't wait forever.
  _forceAbandon(passenger) {
    if (passenger.currentStationId) {
      const station = this.network.stations.get(passenger.currentStationId);
      if (station) {
        const i = station.waitingPassengers.indexOf(passenger.id);
        if (i >= 0) station.waitingPassengers.splice(i, 1);
      }
    }
    if (passenger.vehicleId) {
      const vehicle = this.vehicleSystem.vehicles.get(passenger.vehicleId);
      if (vehicle) {
        const i = vehicle.passengers.indexOf(passenger.id);
        if (i >= 0) vehicle.passengers.splice(i, 1);
      }
    }
    this.economy.recordLostDemand();
    this.passengers.delete(passenger.id);
  }

  _beginWaiting(passenger, stationId) {
    passenger.state = 'waiting';
    passenger.currentStationId = stationId;
    passenger.waitStart = this._now;
    const station = this.network.stations.get(stationId);
    if (station) station.waitingPassengers.push(passenger.id);
  }

  _handleArrival({ vehicle, route, stationId }) {
    const station = this.network.stations.get(stationId);
    if (!station) return;

    // 1. alight first, to free capacity
    for (let i = vehicle.passengers.length - 1; i >= 0; i--) {
      const pid = vehicle.passengers[i];
      const passenger = this.passengers.get(pid);
      if (!passenger) { vehicle.passengers.splice(i, 1); continue; }
      const leg = passenger.plan.rideLegs[passenger.legIndex];
      if (leg && leg.alightStationId === stationId) {
        vehicle.passengers.splice(i, 1);
        if (passenger.legIndex >= passenger.plan.rideLegs.length - 1) {
          passenger.state = 'walking_to_dest';
          passenger.walkRemaining = passenger.plan.walkOutMinutes;
          passenger.currentStationId = null;
        } else {
          passenger.legIndex += 1;
          this._beginWaiting(passenger, stationId);
        }
      }
    }

    // 2. then board waiting passengers whose next leg matches this route/station
    const waiting = station.waitingPassengers;
    for (let i = waiting.length - 1; i >= 0; i--) {
      if (vehicle.passengers.length >= vehicle.capacity) break;
      const pid = waiting[i];
      const passenger = this.passengers.get(pid);
      if (!passenger) { waiting.splice(i, 1); continue; }
      const nextLegIdx = passenger.legIndex < 0 ? 0 : passenger.legIndex;
      const leg = passenger.plan.rideLegs[nextLegIdx];
      if (leg && leg.boardStationId === stationId && leg.routeId === route.id) {
        waiting.splice(i, 1);
        passenger.legIndex = nextLegIdx;
        const waited = this._now - passenger.waitStart;
        passenger.totalWaitMinutes += Math.max(0, waited);
        if (passenger.legIndex > 0) passenger.transfers += 1;
        passenger.state = 'riding';
        passenger.vehicleId = vehicle.id;
        vehicle.passengers.push(pid);
        if (!passenger.routesUsed.includes(route.id)) passenger.routesUsed.push(route.id);
        this.economy.recordBoarding(route.id);
      }
    }

    // anyone still waiting for THIS route but vehicle was full: count a crowding miss
    for (const pid of waiting) {
      const passenger = this.passengers.get(pid);
      if (!passenger) continue;
      const nextLegIdx = passenger.legIndex < 0 ? 0 : passenger.legIndex;
      const leg = passenger.plan.rideLegs[nextLegIdx];
      if (leg && leg.boardStationId === stationId && leg.routeId === route.id) {
        passenger.crowdingMisses += 1;
      }
    }
  }

  _completeTrip(passenger) {
    let score = 100;
    score -= passenger.totalWaitMinutes * 1.6;
    score -= passenger.transfers * 8;
    score -= passenger.crowdingMisses * 6;
    score = Math.max(0, Math.min(100, score));
    this.satisfactionSamples.push(score);
    if (this.satisfactionSamples.length > 400) this.satisfactionSamples.shift();
    this.economy.earnFare(passenger.routesUsed.length ? passenger.routesUsed : ['unassigned']);
    this.passengers.delete(passenger.id);
  }

  update(simMinutes, hour) {
    this._now = (this._now || 0) + simMinutes;
    this.congestion = Math.max(0, this.congestion - simMinutes * 0.02);

    this._spawnPassengers(simMinutes, hour);

    for (const passenger of [...this.passengers.values()]) {
      if (this._now - passenger.bornAt > ABANDON_AFTER_MINUTES) { this._forceAbandon(passenger); continue; }
      if (passenger.state === 'walking_to_station') {
        passenger.walkRemaining -= simMinutes;
        if (passenger.walkRemaining <= 0) this._beginWaiting(passenger, passenger.plan.originStationId);
      } else if (passenger.state === 'walking_to_dest') {
        passenger.walkRemaining -= simMinutes;
        if (passenger.walkRemaining <= 0) this._completeTrip(passenger);
      }
    }

    if (this.satisfactionSamples.length) {
      const sum = this.satisfactionSamples.reduce((a, b) => a + b, 0);
      this.citySatisfaction = sum / this.satisfactionSamples.length;
    }

    this._updateMeshes();
  }

  _spawnPassengers(simMinutes, hour) {
    const { residential, jobsZones } = this.city.demandZones();
    if (!residential.length || !jobsZones.length) return;

    const totalMult = TimeSystem.demandMultiplier(hour);
    const reverseFrac = TimeSystem.reverseCommuteFraction(hour);
    const forwardMult = totalMult * (1 - reverseFrac);
    const reverseMult = totalMult * reverseFrac;

    for (const tile of residential) {
      const pop = this.city.effectivePopulation(tile);
      if (pop < 1) continue;
      this._accumulateSpawns(tile, pop * BASE_SPAWN_RATE * forwardMult * simMinutes, () => {
        const dest = pickWeighted(Math.random, jobsZones, (t) => {
          const jobs = this.city.effectiveJobs(t);
          const d = Math.hypot(t.worldX - tile.worldX, t.worldZ - tile.worldZ);
          return jobs / (1 + d * 0.06);
        });
        if (dest) this.spawnPassenger(tile, dest, hour);
      });
    }

    for (const tile of jobsZones) {
      const jobs = this.city.effectiveJobs(tile);
      if (jobs < 1) continue;
      this._accumulateSpawns(tile, jobs * BASE_SPAWN_RATE * reverseMult * simMinutes, () => {
        const dest = pickWeighted(Math.random, residential, (t) => {
          const pop = this.city.effectivePopulation(t);
          const d = Math.hypot(t.worldX - tile.worldX, t.worldZ - tile.worldZ);
          return pop / (1 + d * 0.06);
        });
        if (dest) this.spawnPassenger(tile, dest, hour);
      });
    }
  }

  _accumulateSpawns(tile, expected, spawnFn) {
    const key = `${tile.x}_${tile.z}`;
    const acc = (this._spawnAccum.get(key) || 0) + expected;
    let whole = Math.floor(acc);
    this._spawnAccum.set(key, acc - whole);
    whole = Math.min(whole, 4); // guard against runaway bursts after long pauses
    for (let i = 0; i < whole; i++) spawnFn();
  }

  _updateMeshes() {
    if (!this._mesh) return;
    const m = new THREE.Matrix4();
    let idx = 0;
    for (const station of this.network.stations.values()) {
      const n = Math.min(station.waitingPassengers.length, 14);
      for (let i = 0; i < n && idx < this._maxWaitingInstances; i++) {
        const angle = (i / Math.max(6, n)) * Math.PI * 2;
        const r = 2.6 + (i % 3) * 0.9;
        const x = station.worldX + Math.cos(angle) * r;
        const z = station.worldZ + Math.sin(angle) * r;
        m.makeTranslation(x, 0.5, z);
        this._mesh.setMatrixAt(idx, m);
        idx++;
      }
    }
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (; idx < this._maxWaitingInstances; idx++) this._mesh.setMatrixAt(idx, zero);
    this._mesh.instanceMatrix.needsUpdate = true;
  }

  get lostDemandRate() { return this.economy.lostDemandToday; }
}
