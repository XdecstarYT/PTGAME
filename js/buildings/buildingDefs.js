// Data layer for the freeform Building Creator: a "structure" layer of
// prefab pieces (walls/floors/roofs) painted per-floor on a grid - the same
// paint-a-grid approach already proven in the station builder's layout
// editor - plus (Phase 2) a finer voxel layer for freeform detailing on top.

export const BUILD_CELL_SIZE = 2; // meters per structure-grid cell

export const FOOTPRINT_PRESETS = [
  { id: 'small', label: 'Small Lot', cols: 6, rows: 6 },
  { id: 'medium', label: 'Medium Lot', cols: 10, rows: 8 },
  { id: 'large', label: 'Large Lot', cols: 14, rows: 12 },
];

export function footprintPreset(id) { return FOOTPRINT_PRESETS.find(f => f.id === id) || FOOTPRINT_PRESETS[0]; }

export const WALL_MATERIALS = [
  { id: 'concrete', label: 'Concrete', color: 0x9a9a94, roughness: 0.85, metalness: 0.05 },
  { id: 'brick', label: 'Brick', color: 0x8a4a35, roughness: 0.8, metalness: 0.05 },
  { id: 'wood', label: 'Wood Panel', color: 0x8a6a4a, roughness: 0.75, metalness: 0 },
  { id: 'steel', label: 'Steel Panel', color: 0x6b7078, roughness: 0.4, metalness: 0.6 },
  { id: 'stucco', label: 'Stucco', color: 0xd9cbb0, roughness: 0.9, metalness: 0 },
];

export function wallMaterial(id) { return WALL_MATERIALS.find(m => m.id === id) || WALL_MATERIALS[0]; }

// category: 'structure' pieces fill a whole grid cell at the current floor's
// wall height; 'floor' pieces are a thin slab; 'roof' pieces cap the top of
// a building. walkable is reserved for a future interior-walkthrough mode.
export const BUILD_PIECES = [
  { id: 'empty', name: 'Erase', icon: '⬛', category: 'empty' },
  { id: 'wall', name: 'Wall', icon: '🧱', category: 'structure' },
  { id: 'window', name: 'Window Wall', icon: '🪟', category: 'structure' },
  { id: 'door', name: 'Door', icon: '🚪', category: 'structure' },
  { id: 'pillar', name: 'Pillar', icon: '🏛️', category: 'structure' },
  { id: 'floor', name: 'Floor / Ceiling', icon: '▪️', category: 'floor' },
  { id: 'roof_flat', name: 'Flat Roof', icon: '⬜', category: 'roof' },
  { id: 'roof_slope', name: 'Sloped Roof', icon: '📐', category: 'roof' },
];

export function buildPiece(id) { return BUILD_PIECES.find(p => p.id === id); }

export const LEVEL_HEIGHT_M = 3;
export const MAX_LEVELS = 6;
