import * as THREE from 'three';
import {
  TILE_SIZE, STATION_COST, STATION_CATCHMENT_RADIUS, VEHICLE_TYPES,
  ROUTE_PALETTE, ZONE,
} from './config.js';

let _idCounter = 1;
function nextId(prefix) { return `${prefix}${_idCounter++}`; }

function makeLabelSprite(text, color = '#ffffff') {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(20,18,26,0.78)';
  ctx.roundRect ? ctx.roundRect(0, 8, 256, 48, 12) : ctx.rect(0, 8, 256, 48);
  ctx.fill();
  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(18, 4.5, 1);
  sprite.renderOrder = 999;
  return sprite;
}

// ---------------- road graph (bus / tram pathing) ----------------

class RoadGraph {
  constructor(city) {
    this.city = city;
    this.nodes = new Map(); // "x_z" -> {x,z}
    this.adj = new Map();
    this._build();
  }

  _key(x, z) { return `${x}_${z}`; }

  _build() {
    const city = this.city;
    for (let x = 0; x < city.size; x++) {
      for (let z = 0; z < city.size; z++) {
        if (city.isRoad(x, z)) {
          const k = this._key(x, z);
          this.nodes.set(k, { x, z });
          this.adj.set(k, []);
        }
      }
    }
    for (const [k, node] of this.nodes) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of dirs) {
        const nk = this._key(node.x + dx, node.z + dz);
        if (this.nodes.has(nk)) this.adj.get(k).push(nk);
      }
    }
  }

  // BFS shortest path between two road tiles -> array of {x,z}
  shortestPath(from, to) {
    const start = this._key(from.x, from.z), goal = this._key(to.x, to.z);
    if (!this.nodes.has(start) || !this.nodes.has(goal)) return null;
    if (start === goal) return [this.nodes.get(start)];
    const prev = new Map();
    const visited = new Set([start]);
    const queue = [start];
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      if (cur === goal) break;
      for (const nb of this.adj.get(cur)) {
        if (!visited.has(nb)) {
          visited.add(nb);
          prev.set(nb, cur);
          queue.push(nb);
        }
      }
    }
    if (!visited.has(goal)) return null;
    const path = [goal];
    let cur = goal;
    while (cur !== start) {
      cur = prev.get(cur);
      path.push(cur);
    }
    path.reverse();
    return path.map(k => this.nodes.get(k));
  }
}

export class Network {
  constructor(city) {
    this.city = city;
    this.roadGraph = new RoadGraph(city);
    this.stations = new Map();
    this.routes = new Map();
    this.trackedTiles = new Set(); // tram track already paid for, keyed "x_z"
    this._paletteIndex = 0;
    this._group = null;
  }

  // ---------------- stations ----------------

  canPlaceStation(x, z) {
    if (!this.city.isBuildable(x, z)) return { ok: false, reason: 'Must be placed on a developed zone tile.' };
    const road = this.city.nearestRoadTile(x, z, 3);
    if (!road) return { ok: false, reason: 'No road access within range.' };
    for (const s of this.stations.values()) {
      if (s.x === x && s.z === z) return { ok: false, reason: 'A station already exists here.' };
      const dx = s.worldX - (x + 0.5) * TILE_SIZE, dz = s.worldZ - (z + 0.5) * TILE_SIZE;
      if (Math.sqrt(dx * dx + dz * dz) < TILE_SIZE * 1.1) return { ok: false, reason: 'Too close to another station.' };
    }
    return { ok: true, road };
  }

  addStation(x, z, name) {
    const check = this.canPlaceStation(x, z);
    if (!check.ok) return null;
    const id = nextId('st');
    const pos = this.city.tileCenterWorld(x, z);
    const station = {
      id, name: name || `Station ${this.stations.size + 1}`,
      x, z, worldX: pos.x, worldZ: pos.z,
      roadTile: check.road,
      radius: STATION_CATCHMENT_RADIUS,
      routeIds: new Set(),
      waitingPassengers: [],
      stats: { boarded: 0, alighted: 0 },
    };
    this.stations.set(id, station);
    return station;
  }

  removeStation(id) {
    const station = this.stations.get(id);
    if (!station) return;
    for (const routeId of [...station.routeIds]) {
      const route = this.routes.get(routeId);
      if (!route) continue;
      route.stationIds = route.stationIds.filter(sid => sid !== id);
      if (route.stationIds.length < 2) {
        this.removeRoute(routeId);
      } else {
        this.recomputeRoutePath(route);
      }
    }
    this.stations.delete(id);
  }

  // ---------------- routes ----------------

  createRoute(type = 'bus', name) {
    const id = nextId('rt');
    const color = ROUTE_PALETTE[this._paletteIndex++ % ROUTE_PALETTE.length];
    const route = {
      id, name: name || `Line ${this.routes.size + 1}`,
      type, color,
      stationIds: [],
      loop: false,
      frequency: 2, // number of vehicles
      vehicleIds: [],
      path: [], // world Vector3 points
      legDistances: [], // distance for leg i -> i+1
      cumDistances: [], // cumulative distance at each station index
      length: 0,
      newTrackTiles: [],
      builtCost: 0,
      revenueToday: 0, costToday: 0,
    };
    this.routes.set(id, route);
    return route;
  }

  removeRoute(id) {
    const route = this.routes.get(id);
    if (!route) return;
    for (const sid of route.stationIds) {
      const s = this.stations.get(sid);
      if (s) s.routeIds.delete(id);
    }
    this.routes.delete(id);
  }

  addStationToRoute(routeId, stationId) {
    const route = this.routes.get(routeId);
    const station = this.stations.get(stationId);
    if (!route || !station) return false;
    if (route.stationIds[route.stationIds.length - 1] === stationId) return false;
    route.stationIds.push(stationId);
    station.routeIds.add(routeId);
    this.recomputeRoutePath(route);
    return true;
  }

  setRouteLoop(routeId, loop) {
    const route = this.routes.get(routeId);
    if (!route) return;
    route.loop = loop;
    this.recomputeRoutePath(route);
  }

  setRouteType(routeId, type) {
    const route = this.routes.get(routeId);
    if (!route) return;
    route.type = type;
    this.recomputeRoutePath(route);
  }

  setRouteFrequency(routeId, freq) {
    const route = this.routes.get(routeId);
    if (!route) return;
    route.frequency = Math.max(1, Math.min(12, Math.round(freq)));
  }

  // Rebuild the route's driving path + distances given its type & stations.
  // Returns cost info for any *new* track/tunnel construction required.
  recomputeRoutePath(route) {
    const stationIds = route.loop ? [...route.stationIds, route.stationIds[0]] : route.stationIds;
    const points = [];
    const legDistances = [];
    const newTrackTiles = [];
    let tunnelDistance = 0;

    for (let i = 0; i < stationIds.length - 1; i++) {
      const a = this.stations.get(stationIds[i]);
      const b = this.stations.get(stationIds[i + 1]);
      if (!a || !b) continue;
      let legPoints = [];

      if (route.type === 'subway') {
        legPoints = [new THREE.Vector3(a.worldX, 0, a.worldZ), new THREE.Vector3(b.worldX, 0, b.worldZ)];
        tunnelDistance += legPoints[0].distanceTo(legPoints[1]);
      } else {
        const roadPath = this.roadGraph.shortestPath(a.roadTile, b.roadTile);
        legPoints.push(new THREE.Vector3(a.worldX, 0, a.worldZ));
        if (roadPath) {
          for (const node of roadPath) {
            const wp = this.city.tileCenterWorld(node.x, node.z);
            legPoints.push(wp);
            if (route.type === 'tram') {
              const key = `${node.x}_${node.z}`;
              if (!this.trackedTiles.has(key)) newTrackTiles.push(key);
            }
          }
        }
        legPoints.push(new THREE.Vector3(b.worldX, 0, b.worldZ));
      }

      // dedupe consecutive duplicate points
      const cleaned = [legPoints[0]];
      for (let p = 1; p < legPoints.length; p++) {
        if (legPoints[p].distanceTo(cleaned[cleaned.length - 1]) > 0.01) cleaned.push(legPoints[p]);
      }
      legPoints = cleaned;

      let dist = 0;
      for (let p = 1; p < legPoints.length; p++) dist += legPoints[p].distanceTo(legPoints[p - 1]);
      legDistances.push(dist);

      if (i === 0) points.push(...legPoints);
      else points.push(...legPoints.slice(1));
    }

    route.path = points;
    route.sequenceStationIds = stationIds;
    route.legDistances = legDistances;
    route.cumDistances = [0];
    for (const d of legDistances) route.cumDistances.push(route.cumDistances[route.cumDistances.length - 1] + d);
    route.length = route.cumDistances[route.cumDistances.length - 1] || 0;

    route.pointDistances = [0];
    for (let p = 1; p < points.length; p++) {
      route.pointDistances.push(route.pointDistances[p - 1] + points[p].distanceTo(points[p - 1]));
    }

    route.pendingNewTrackTiles = newTrackTiles;
    route.pendingTunnelDistance = tunnelDistance;
    return {
      trackTiles: newTrackTiles.length,
      trackCost: newTrackTiles.length * (VEHICLE_TYPES.tram.trackCostPerTile || 0),
      tunnelDistance,
      tunnelCost: tunnelDistance * (VEHICLE_TYPES.subway.tunnelCostPerUnit || 0),
    };
  }

  commitTrackConstruction(route) {
    for (const key of route.pendingNewTrackTiles || []) this.trackedTiles.add(key);
  }

  // Interpolate a world-space point at `dist` along the route's driving path.
  pointAtDistance(route, dist) {
    const pd = route.pointDistances, pts = route.path;
    if (!pd || pd.length < 2) return pts[0] ? pts[0].clone() : new THREE.Vector3();
    const clamped = Math.max(0, Math.min(pd[pd.length - 1], dist));
    let lo = 0, hi = pd.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (pd[mid] <= clamped) lo = mid; else hi = mid;
    }
    const segLen = pd[hi] - pd[lo] || 1;
    const t = (clamped - pd[lo]) / segLen;
    return new THREE.Vector3().lerpVectors(pts[lo], pts[hi], t);
  }

  // travel time in sim-minutes for the i-th leg (station index i -> i+1 within the route order)
  legMinutes(route, legIndex) {
    const speed = VEHICLE_TYPES[route.type].speed;
    return (route.legDistances[legIndex] || 0) / speed;
  }

  routeRoundTripMinutes(route) {
    const speed = VEHICLE_TYPES[route.type].speed;
    const dwell = 0.4 * route.stationIds.length * (route.loop ? 1 : 2);
    const travel = route.loop ? route.length / speed : (route.length * 2) / speed;
    return travel + dwell;
  }

  headwayMinutes(route) {
    const rt = this.routeRoundTripMinutes(route);
    return rt / Math.max(1, route.frequency);
  }

  // Graph edges for passenger pathfinding: adjacent-station legs per route,
  // both directions for there-and-back lines, one direction for loops.
  getRouteEdges() {
    const edges = [];
    for (const route of this.routes.values()) {
      const n = route.stationIds.length;
      if (n < 2) continue;
      for (let i = 0; i < n - 1; i++) {
        const minutes = this.legMinutes(route, i);
        edges.push({ from: route.stationIds[i], to: route.stationIds[i + 1], routeId: route.id, minutes });
        if (!route.loop) edges.push({ from: route.stationIds[i + 1], to: route.stationIds[i], routeId: route.id, minutes });
      }
      if (route.loop) {
        const minutes = this.legMinutes(route, n - 1);
        edges.push({ from: route.stationIds[n - 1], to: route.stationIds[0], routeId: route.id, minutes });
      }
    }
    return edges;
  }

  coveragePercent() {
    const { residential, jobsZones } = this.city.demandZones();
    const all = [...residential, ...jobsZones];
    if (!all.length) return 0;
    let covered = 0;
    for (const tile of all) {
      let hit = false;
      for (const s of this.stations.values()) {
        const dx = s.worldX - tile.worldX, dz = s.worldZ - tile.worldZ;
        if (Math.sqrt(dx * dx + dz * dz) <= s.radius) { hit = true; break; }
      }
      if (hit) covered++;
    }
    return covered / all.length;
  }

  // ---------------- rendering ----------------

  buildMeshes(scene) {
    this.scene = scene;
    this.refreshMeshes();
  }

  refreshMeshes() {
    if (this._group) {
      this.scene.remove(this._group);
      this._group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
    const group = new THREE.Group();
    this._group = group;

    for (const route of this.routes.values()) {
      if (route.path.length < 2) continue;
      const underground = route.type === 'subway';
      const yOff = underground ? -6 : (route.type === 'tram' ? 0.35 : 0.25);
      const pts = route.path.map(p => new THREE.Vector3(p.x, yOff, p.z));
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.05);
      const radius = route.type === 'subway' ? 0.55 : route.type === 'tram' ? 0.45 : 0.3;
      const tubeGeo = new THREE.TubeGeometry(curve, Math.max(8, pts.length * 4), radius, 6, false);
      const mat = new THREE.MeshStandardMaterial({
        color: route.color, emissive: route.color, emissiveIntensity: underground ? 0.25 : 0.12,
        transparent: underground, opacity: underground ? 0.65 : 1,
      });
      const tube = new THREE.Mesh(tubeGeo, mat);
      tube.castShadow = !underground;
      group.add(tube);

      if (underground) {
        // vertical shafts connecting the tunnel back up to its stations
        for (const sid of route.stationIds) {
          const s = this.stations.get(sid);
          if (!s) continue;
          const shaftGeo = new THREE.CylinderGeometry(0.4, 0.4, Math.abs(yOff), 6);
          const shaftMat = new THREE.MeshStandardMaterial({ color: route.color, transparent: true, opacity: 0.4 });
          const shaft = new THREE.Mesh(shaftGeo, shaftMat);
          shaft.position.set(s.worldX, yOff / 2, s.worldZ);
          group.add(shaft);
        }
      }
    }

    for (const station of this.stations.values()) {
      const colors = [...station.routeIds].map(rid => this.routes.get(rid)?.color).filter(Boolean);
      const baseColor = colors[0] ?? 0xffffff;

      const poleGeo = new THREE.CylinderGeometry(0.25, 0.25, 3.2, 8);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c2a33 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(station.worldX, 1.6, station.worldZ);
      pole.castShadow = true;
      group.add(pole);

      const capGeo = new THREE.CylinderGeometry(1.6, 1.6, 0.5, 16);
      const capMat = new THREE.MeshStandardMaterial({ color: baseColor, emissive: baseColor, emissiveIntensity: 0.25 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(station.worldX, 3.4, station.worldZ);
      cap.castShadow = true;
      group.add(cap);

      const label = makeLabelSprite(station.name);
      label.position.set(station.worldX, 6.2, station.worldZ);
      group.add(label);

      const ringGeo = new THREE.RingGeometry(station.radius - 0.3, station.radius, 40);
      const ringMat = new THREE.MeshBasicMaterial({ color: baseColor, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(station.worldX, 0.05, station.worldZ);
      group.add(ring);
    }

    this.scene.add(group);
  }
}
