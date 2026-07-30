import { WORLD_SIZE, ZONE, ZONE_COLORS, VEHICLE_TYPES } from './config.js';

// Mini-Metro-style 2D overlay: straight station-to-station lines instead of
// the road-following 3D path, for at-a-glance network legibility. Shares the
// exact same click -> tool pipeline as the 3D view via onTileClick.

export class SchematicView {
  constructor({ canvas, city, network, vehicleSystem, onTileClick, cargoSystem }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.city = city;
    this.network = network;
    this.vehicleSystem = vehicleSystem;
    this.onTileClick = onTileClick;
    this.cargoSystem = cargoSystem;
    this.visible = false;
    this._dirty = true;
    this.heatmapMode = 'off'; // 'off' | 'demand' | 'crowding'
    this._heatmapCache = null;
    this._heatmapCacheAt = -Infinity;

    this._staticCanvas = document.createElement('canvas');
    this._staticCtx = this._staticCanvas.getContext('2d');

    this._wireInput();
    window.addEventListener('resize', () => { this._resize(); this._dirty = true; });
    this._resize();
  }

  markDirty() { this._dirty = true; }

  setHeatmapMode(mode) {
    this.heatmapMode = mode;
    this._heatmapCacheAt = -Infinity; // force recompute on next render
  }

  _demandHeatmapPoints() {
    const { residential, jobsZones } = this.city.demandZones();
    const stations = [...this.network.stations.values()];
    const points = [];
    let maxVal = 1;
    for (const tile of [...residential, ...jobsZones]) {
      const val = tile.type === ZONE.RESIDENTIAL ? this.city.effectivePopulation(tile) : this.city.effectiveJobs(tile);
      if (val < 1) continue;
      const covered = stations.some(s => Math.hypot(s.worldX - tile.worldX, s.worldZ - tile.worldZ) <= s.radius);
      if (covered) continue;
      points.push({ tile, val });
      if (val > maxVal) maxVal = val;
    }
    return points.map(p => ({ tile: p.tile, intensity: p.val / maxVal }));
  }

  // Uncovered industrial demand for freight pickup - the same "where should
  // I build next" signal _demandHeatmapPoints gives for passenger stations,
  // but scoped to industrial tiles and depot catchments instead.
  _freightHeatmapPoints() {
    if (!this.cargoSystem) return [];
    const depots = [...this.cargoSystem.depots.values()];
    const points = [];
    let maxVal = 1;
    for (let x = 0; x < this.city.size; x++) {
      for (let z = 0; z < this.city.size; z++) {
        const tile = this.city.tileAt(x, z);
        if (!tile || tile.type !== ZONE.INDUSTRIAL) continue;
        const val = this.city.effectiveJobs(tile);
        if (val < 1) continue;
        const covered = depots.some(d => Math.hypot(d.worldX - tile.worldX, d.worldZ - tile.worldZ) <= d.radius);
        if (covered) continue;
        points.push({ tile, val });
        if (val > maxVal) maxVal = val;
      }
    }
    return points.map(p => ({ tile: p.tile, intensity: p.val / maxVal }));
  }

  _crowdingHeatmapRoutes() {
    const out = [];
    for (const route of this.network.routes.values()) {
      if (!route.committed) continue;
      const vehicles = route.vehicleIds.map(id => this.vehicleSystem.vehicles.get(id)).filter(Boolean);
      if (!vehicles.length) continue;
      const avgLoad = vehicles.reduce((a, v) => a + v.passengers.length / Math.max(1, v.capacity), 0) / vehicles.length;
      out.push({ route, avgLoad });
    }
    return out;
  }

  _refreshHeatmapCache() {
    const now = performance.now();
    if (now - this._heatmapCacheAt < 1500) return;
    this._heatmapCacheAt = now;
    if (this.heatmapMode === 'demand') this._heatmapCache = this._demandHeatmapPoints();
    else if (this.heatmapMode === 'crowding') this._heatmapCache = this._crowdingHeatmapRoutes();
    else if (this.heatmapMode === 'freight') this._heatmapCache = this._freightHeatmapPoints();
    else this._heatmapCache = null;
  }

  _drawHeatmap(ctx) {
    if (this.heatmapMode === 'off' || !this._heatmapCache) return;
    if (this.heatmapMode === 'demand') {
      const size = 13 * this.scale;
      for (const { tile, intensity } of this._heatmapCache) {
        const [x, z] = this.worldToScreen(tile.worldX, tile.worldZ);
        ctx.fillStyle = `rgba(255,70,60,${0.12 + intensity * 0.55})`;
        ctx.fillRect(x - size / 2, z - size / 2, size, size);
      }
    } else if (this.heatmapMode === 'freight') {
      const size = 13 * this.scale;
      for (const { tile, intensity } of this._heatmapCache) {
        const [x, z] = this.worldToScreen(tile.worldX, tile.worldZ);
        ctx.fillStyle = `rgba(217,160,102,${0.15 + intensity * 0.55})`;
        ctx.fillRect(x - size / 2, z - size / 2, size, size);
      }
    } else if (this.heatmapMode === 'crowding') {
      for (const { route, avgLoad } of this._heatmapCache) {
        const seq = route.sequenceStationIds || route.stationIds;
        const color = avgLoad > 0.8 ? '255,70,60' : avgLoad > 0.5 ? '255,209,102' : '110,231,201';
        ctx.strokeStyle = `rgba(${color},0.4)`;
        ctx.lineWidth = Math.max(6, 12 * this.scale / 2.4);
        ctx.lineCap = 'round';
        ctx.beginPath();
        seq.forEach((sid, i) => {
          const s = this.network.stations.get(sid);
          if (!s) return;
          const [x, z] = this.worldToScreen(s.worldX, s.worldZ);
          if (i === 0) ctx.moveTo(x, z); else ctx.lineTo(x, z);
        });
        ctx.stroke();
      }
    }
  }

  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = w; this.canvas.height = h;
    this._staticCanvas.width = w; this._staticCanvas.height = h;
    const pad = 60;
    this.scale = (Math.min(w, h) - pad * 2) / WORLD_SIZE;
    this.offsetX = (w - WORLD_SIZE * this.scale) / 2;
    this.offsetY = (h - WORLD_SIZE * this.scale) / 2;
  }

  worldToScreen(x, z) {
    return [this.offsetX + x * this.scale, this.offsetY + z * this.scale];
  }

  screenToWorld(px, py) {
    return [(px - this.offsetX) / this.scale, (py - this.offsetY) / this.scale];
  }

  _wireInput() {
    let down = null;
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (dist > 6) return;
      const rect = this.canvas.getBoundingClientRect();
      const [wx, wz] = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const { x, z } = this.city.worldToTile(wx, wz);
      this.onTileClick(x, z);
    });
  }

  _redrawStatic() {
    const ctx = this._staticCtx;
    const w = this._staticCanvas.width, h = this._staticCanvas.height;
    ctx.fillStyle = '#171a24';
    ctx.fillRect(0, 0, w, h);

    // faint zone blocks
    for (const block of this.city.blocks.values()) {
      if (!block.unlocked) continue;
      for (const tile of block.tiles) {
        if (tile.type === ZONE.EMPTY) continue;
        const [x, z] = this.worldToScreen(tile.worldX, tile.worldZ);
        const size = 12 * this.scale;
        let color = '#232633';
        if (tile.type === ZONE.WATER) color = '#1c3a52';
        else if (tile.type === ZONE.RESIDENTIAL) color = '#2a3a28';
        else if (tile.type === ZONE.COMMERCIAL) color = '#223247';
        else if (tile.type === ZONE.INDUSTRIAL) color = '#3a2f22';
        else if (tile.type === ZONE.LANDMARK) color = '#3a2532';
        ctx.fillStyle = color;
        ctx.fillRect(x - size / 2, z - size / 2, size, size);
      }
    }

    // outer boundary
    const [x0, z0] = this.worldToScreen(0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(x0, z0, WORLD_SIZE * this.scale, WORLD_SIZE * this.scale);

    this._dirty = false;
  }

  render() {
    if (!this.visible) return;
    if (this._dirty) this._redrawStatic();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this._staticCanvas, 0, 0);

    this._refreshHeatmapCache();
    this._drawHeatmap(ctx);

    // route lines: straight segments through stations in route order
    for (const route of this.network.routes.values()) {
      if (route.stationIds.length < 2) continue;
      const seq = route.sequenceStationIds || route.stationIds;
      ctx.strokeStyle = `#${route.color.toString(16).padStart(6, '0')}`;
      ctx.lineWidth = route.type === 'subway' ? 5 : route.type === 'tram' ? 4 : 3;
      ctx.setLineDash(route.type === 'subway' ? [8, 6] : []);
      ctx.beginPath();
      seq.forEach((sid, i) => {
        const s = this.network.stations.get(sid);
        if (!s) return;
        const [x, z] = this.worldToScreen(s.worldX, s.worldZ);
        if (i === 0) ctx.moveTo(x, z); else ctx.lineTo(x, z);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // vehicles: interpolate along the straight schematic path using station cumDistances
    for (const vehicle of this.vehicleSystem.vehicles.values()) {
      const route = this.network.routes.get(vehicle.routeId);
      if (!route || !route.cumDistances || route.cumDistances.length < 2) continue;
      const cum = route.cumDistances;
      const seq = route.sequenceStationIds || route.stationIds;
      let segI = 0;
      for (let i = 0; i < cum.length - 1; i++) { if (vehicle.dist >= cum[i]) segI = i; }
      const a = this.network.stations.get(seq[segI]);
      const b = this.network.stations.get(seq[Math.min(segI + 1, seq.length - 1)]);
      if (!a || !b) continue;
      const span = cum[segI + 1] - cum[segI] || 1;
      const t = Math.max(0, Math.min(1, (vehicle.dist - cum[segI]) / span));
      const x = a.worldX + (b.worldX - a.worldX) * t;
      const z = a.worldZ + (b.worldZ - a.worldZ) * t;
      const [sx, sz] = this.worldToScreen(x, z);
      ctx.fillStyle = `#${route.color.toString(16).padStart(6, '0')}`;
      ctx.beginPath();
      ctx.arc(sx, sz, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // stations
    for (const station of this.network.stations.values()) {
      const [x, z] = this.worldToScreen(station.worldX, station.worldZ);
      const routeColors = [...station.routeIds].map(id => this.network.routes.get(id)?.color).filter(Boolean);
      ctx.fillStyle = routeColors.length ? `#${routeColors[0].toString(16).padStart(6, '0')}` : '#e8e4f0';
      ctx.beginPath();
      ctx.arc(x, z, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#12131a';
      ctx.beginPath();
      ctx.arc(x, z, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '11px sans-serif';
      ctx.fillStyle = 'rgba(240,236,255,0.85)';
      ctx.textAlign = 'center';
      ctx.fillText(station.name, x, z - 12);

      if (station.waitingPassengers.length > 0) {
        ctx.fillStyle = '#ffd166';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(`${station.waitingPassengers.length}`, x, z + 20);
      }
    }

    this._drawFreight(ctx);
  }

  // Cargo depots (amber squares) and their trucks (small amber dots),
  // drawn the same way stations/vehicles are above but visually distinct
  // so the freight layer reads as a separate network at a glance.
  _drawFreight(ctx) {
    if (!this.cargoSystem) return;
    for (const depot of this.cargoSystem.depots.values()) {
      const [x, z] = this.worldToScreen(depot.worldX, depot.worldZ);
      ctx.fillStyle = '#d9a066';
      ctx.fillRect(x - 6, z - 6, 12, 12);
      ctx.strokeStyle = '#12131a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 6, z - 6, 12, 12);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = 'rgba(240,236,255,0.85)';
      ctx.textAlign = 'center';
      ctx.fillText(depot.name, x, z - 12);
    }
    for (const truck of this.cargoSystem.trucks.values()) {
      if (truck.state !== 'enroute') continue;
      const [x, z] = this.worldToScreen(truck.worldX, truck.worldZ);
      ctx.fillStyle = '#d9a066';
      ctx.beginPath();
      ctx.arc(x, z, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
