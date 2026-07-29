import { chassisById } from './chassisDefs.js';

const STORAGE_KEY = 'ptgame_vehicle_catalog_v1';
let _idCounter = 1;
function nextId() { return `model_${Date.now().toString(36)}_${_idCounter++}`; }

function isValidModelShape(m) {
  return m && typeof m === 'object' && typeof m.chassisId === 'string'
    && typeof m.powertrainId === 'string' && Array.isArray(m.floorPlan)
    && Array.isArray(m.doorZonesActive) && typeof m.consistCars === 'number';
}

// Saved vehicle designs. Persisted to localStorage so a catalog survives a
// reload; export/import round-trip through plain JSON so designs can be
// shared as files without any backend.
export class Catalog {
  constructor() {
    this.models = new Map();
    this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      for (const m of arr) if (isValidModelShape(m) && m.id) this.models.set(m.id, m);
    } catch (e) {
      // corrupt/unavailable storage - start with an empty catalog
    }
  }

  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.models.values()]));
    } catch (e) {
      // storage full or unavailable - designs still work for this session
    }
  }

  get(id) { return this.models.get(id); }

  list(category = null) {
    const all = [...this.models.values()];
    if (!category) return all;
    return all.filter(m => chassisById(m.chassisId)?.category === category);
  }

  // usedBy: optional predicate(modelId) => bool, used to block deleting a
  // model that's currently assigned to a live route.
  isInUse(id, usedBy) { return typeof usedBy === 'function' ? usedBy(id) : false; }

  save(model) {
    if (!model.id) model.id = nextId();
    model.updatedAt = Date.now();
    this.models.set(model.id, model);
    this._persist();
    return model;
  }

  clone(id) {
    const src = this.models.get(id);
    if (!src) return null;
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = nextId();
    copy.name = `${src.name} (Copy)`;
    copy.createdAt = Date.now();
    this.models.set(copy.id, copy);
    this._persist();
    return copy;
  }

  remove(id) {
    this.models.delete(id);
    this._persist();
  }

  exportJSON(id) {
    const m = this.models.get(id);
    return m ? JSON.stringify(m, null, 2) : null;
  }

  downloadExport(id) {
    const json = this.exportJSON(id);
    if (!json) return;
    const model = this.models.get(id);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(model.name || 'vehicle').replace(/[^a-z0-9-_]+/gi, '_')}.json`;
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
    if (!isValidModelShape(parsed)) throw new Error('That JSON does not look like a vehicle design.');
    parsed.id = nextId();
    parsed.name = parsed.name || 'Imported Design';
    parsed.createdAt = Date.now();
    this.models.set(parsed.id, parsed);
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
