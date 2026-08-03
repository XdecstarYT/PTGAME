import { famousStationDesigns } from './famousStations.js';
import { famousStationDesignsBatch2 } from './famousStationsBatch2.js';

const STORAGE_KEY = 'ptgame_station_catalog_v1';
// Each starter-gallery batch gets its own persisted flag so batches added
// later (batch 2, batch 3, ...) still seed once for players who already
// have batch 1, without re-seeding batch 1 itself.
const SEED_BATCHES = [
  { flagKey: 'ptgame_station_catalog_seeded_v1', designsFn: famousStationDesigns },
  { flagKey: 'ptgame_station_catalog_seeded_v2', designsFn: famousStationDesignsBatch2 },
];
let _idCounter = 1;
function nextId() { return `stn_${Date.now().toString(36)}_${_idCounter++}`; }

function isValidDesignShape(d) {
  return d && typeof d === 'object' && typeof d.typeId === 'string' && typeof d.tierId === 'string'
    && Array.isArray(d.levels);
}

// Saved station designs - mirrors the vehicle Catalog / BuildingCatalog shape
// (save/list/clone/remove/export/import, localStorage-persisted) so a
// designed station is a reusable, shareable template just like a vehicle or
// building design.
export class StationCatalog {
  constructor() {
    this.designs = new Map();
    this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        for (const d of arr) if (isValidDesignShape(d) && d.id) this.designs.set(d.id, d);
      }
    } catch (e) {
      // corrupt/unavailable storage - start with an empty catalog
    }
    this._seedFamousStationsIfNeeded();
  }

  // One-time starter gallery of famous-station-inspired designs (see
  // famousStations.js/famousStationsBatch2.js), gated on a persisted flag
  // per batch rather than "catalog is currently empty" - so a player who
  // deliberately deletes some of them doesn't have them silently reappear
  // on the next reload, while a new batch still reaches existing players.
  _seedFamousStationsIfNeeded() {
    let persisted = false;
    for (const { flagKey, designsFn } of SEED_BATCHES) {
      try {
        if (localStorage.getItem(flagKey)) continue;
      } catch (e) {
        // localStorage unavailable - fall through and seed in-memory for
        // this session anyway, just without a persisted flag to prevent a
        // re-seed (there's nothing to persist either way in that case).
      }
      for (const design of designsFn()) {
        design.id = nextId();
        design.createdAt = Date.now();
        this.designs.set(design.id, design);
      }
      persisted = true;
      try { localStorage.setItem(flagKey, '1'); } catch (e) {
        // storage unavailable - nothing to do, this session just seeds once
      }
    }
    if (persisted) this._persist();
  }

  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.designs.values()]));
    } catch (e) {
      // storage full or unavailable - designs still work for this session
    }
  }

  get(id) { return this.designs.get(id); }

  list(typeId = null) {
    const all = [...this.designs.values()];
    return typeId ? all.filter(d => d.typeId === typeId) : all;
  }

  isInUse(id, usedBy) { return typeof usedBy === 'function' ? usedBy(id) : false; }

  save(design) {
    if (!design.id) design.id = nextId();
    design.updatedAt = Date.now();
    this.designs.set(design.id, design);
    this._persist();
    return design;
  }

  clone(id) {
    const src = this.designs.get(id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = nextId();
    copy.name = `${src.name} (Copy)`;
    copy.createdAt = Date.now();
    this.designs.set(copy.id, copy);
    this._persist();
    return copy;
  }

  remove(id) {
    this.designs.delete(id);
    this._persist();
  }

  exportJSON(id) {
    const d = this.designs.get(id);
    return d ? JSON.stringify(d, null, 2) : null;
  }

  downloadExport(id) {
    const json = this.exportJSON(id);
    if (!json) return;
    const design = this.designs.get(id);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(design.name || 'station').replace(/[^a-z0-9-_]+/gi, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  importFromJSONString(str) {
    let parsed;
    try {
      parsed = JSON.parse(str);
    } catch (e) {
      throw new Error('That file is not valid JSON.');
    }
    if (!isValidDesignShape(parsed)) throw new Error('That JSON does not look like a station design.');
    parsed.id = nextId();
    parsed.name = parsed.name || 'Imported Station';
    parsed.createdAt = Date.now();
    this.designs.set(parsed.id, parsed);
    this._persist();
    return parsed;
  }

  importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(this.importFromJSONString(String(reader.result))); }
        catch (e) { reject(e); }
      };
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.readAsText(file);
    });
  }
}
