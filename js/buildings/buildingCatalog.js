const STORAGE_KEY = 'ptgame_building_catalog_v1';
let _idCounter = 1;
function nextId() { return `bldg_${Date.now().toString(36)}_${_idCounter++}`; }

function isValidDesignShape(d) {
  return d && typeof d === 'object' && typeof d.cols === 'number' && typeof d.rows === 'number'
    && Array.isArray(d.levels) && Array.isArray(d.voxels);
}

// Saved building designs - mirrors the vehicle Catalog's shape exactly
// (save/list/clone/remove/export/import, localStorage-persisted, JSON
// round-trip for sharing designs as files without a backend).
export class BuildingCatalog {
  constructor() {
    this.designs = new Map();
    this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      for (const d of arr) if (isValidDesignShape(d) && d.id) this.designs.set(d.id, d);
    } catch (e) {
      // corrupt/unavailable storage - start with an empty catalog
    }
  }

  _persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.designs.values()]));
    } catch (e) {
      // storage full or unavailable - designs still work for this session
    }
  }

  get(id) { return this.designs.get(id); }
  list() { return [...this.designs.values()]; }

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
    a.download = `${(design.name || 'building').replace(/[^a-z0-9-_]+/gi, '_')}.json`;
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
    if (!isValidDesignShape(parsed)) throw new Error('That JSON does not look like a building design.');
    parsed.id = nextId();
    parsed.name = parsed.name || 'Imported Building';
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
