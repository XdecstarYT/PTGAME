// Data layer for the freeform Building Creator: a "structure" layer of
// prefab pieces (walls/floors/roofs) painted per-floor on a grid - the same
// paint-a-grid approach already proven in the station builder's layout
// editor - plus (Phase 2) a finer voxel layer for freeform detailing on top.

export const BUILD_CELL_SIZE = 2; // meters per structure-grid cell

export const FOOTPRINT_PRESETS = [
  { id: 'small', label: 'Small Lot', cols: 6, rows: 6 },
  { id: 'medium', label: 'Medium Lot', cols: 10, rows: 8 },
  { id: 'large', label: 'Large Lot', cols: 14, rows: 12 },
  { id: 'estate', label: 'Estate Lot', cols: 20, rows: 16 },
];

export function footprintPreset(id) { return FOOTPRINT_PRESETS.find(f => f.id === id) || FOOTPRINT_PRESETS[0]; }

export const WALL_MATERIALS = [
  { id: 'concrete', label: 'Concrete', color: 0x9a9a94, roughness: 0.85, metalness: 0.05 },
  { id: 'brick', label: 'Brick', color: 0x8a4a35, roughness: 0.8, metalness: 0.05 },
  { id: 'wood', label: 'Wood Panel', color: 0x8a6a4a, roughness: 0.75, metalness: 0 },
  { id: 'steel', label: 'Steel Panel', color: 0x6b7078, roughness: 0.4, metalness: 0.6 },
  { id: 'stucco', label: 'Stucco', color: 0xd9cbb0, roughness: 0.9, metalness: 0 },
  { id: 'glass_curtain', label: 'Glass Curtain Wall', color: 0x9fc9d9, roughness: 0.1, metalness: 0.3 },
  { id: 'painted_siding', label: 'Painted Siding', color: 0xcfe0d8, roughness: 0.7, metalness: 0 },
  { id: 'stone_clad', label: 'Stone Cladding', color: 0x8a8578, roughness: 0.95, metalness: 0 },
];

export function wallMaterial(id) { return WALL_MATERIALS.find(m => m.id === id) || WALL_MATERIALS[0]; }

// A design-wide roof finish, independent of wall material - real buildings
// almost always read their roof as a visually distinct surface rather than
// a flat cap in the same color as the walls below it.
export const ROOF_MATERIALS = [
  { id: 'shingle', label: 'Asphalt Shingle', color: 0x3a3a3d, roughness: 0.9, metalness: 0.05 },
  { id: 'tile', label: 'Terracotta Tile', color: 0xa8543a, roughness: 0.75, metalness: 0.05 },
  { id: 'metal', label: 'Standing-Seam Metal', color: 0x9ea4ab, roughness: 0.35, metalness: 0.6 },
  { id: 'membrane', label: 'Flat Membrane', color: 0x24262b, roughness: 0.95, metalness: 0 },
  { id: 'thatch', label: 'Thatch', color: 0xb99a4f, roughness: 1, metalness: 0 },
  { id: 'glass_atrium', label: 'Glass Atrium', color: 0x9fd6e8, roughness: 0.1, metalness: 0.1 },
];

export function roofMaterial(id) { return ROOF_MATERIALS.find(m => m.id === id) || ROOF_MATERIALS[0]; }

// category: 'structure' pieces fill a whole grid cell at the current floor's
// wall height; 'floor' pieces are a thin slab; 'roof' pieces cap the top of
// a building. walkable is reserved for a future interior-walkthrough mode.
export const BUILD_PIECES = [
  { id: 'empty', name: 'Erase', icon: '⬛', category: 'empty' },
  { id: 'wall', name: 'Wall', icon: '🧱', category: 'structure' },
  { id: 'window', name: 'Window Wall', icon: '🪟', category: 'structure' },
  { id: 'door', name: 'Door', icon: '🚪', category: 'structure' },
  { id: 'pillar', name: 'Pillar', icon: '🏛️', category: 'structure' },
  { id: 'garage_door', name: 'Garage Door', icon: '🚙', category: 'structure' },
  { id: 'arch', name: 'Archway', icon: '⛩️', category: 'structure' },
  { id: 'floor', name: 'Floor / Ceiling', icon: '▪️', category: 'floor' },
  { id: 'balcony', name: 'Balcony', icon: '🪵', category: 'floor' },
  { id: 'roof_flat', name: 'Flat Roof', icon: '⬜', category: 'roof' },
  { id: 'roof_slope', name: 'Sloped Roof', icon: '📐', category: 'roof' },
  { id: 'chimney', name: 'Chimney', icon: '🏭', category: 'roof' },
  { id: 'skylight', name: 'Skylight', icon: '🌤️', category: 'roof' },
];

export function buildPiece(id) { return BUILD_PIECES.find(p => p.id === id); }

export const LEVEL_HEIGHT_M = 3;
export const MAX_LEVELS = 6;

// ---------------- Voxel decoration layer (Phase 2) ----------------

// Finer-grained blocks the player can freely add/remove on top of (or
// around) the prefab structure, Minecraft-style - much smaller than a
// structure grid cell so they read as detail, not another wall.
export const VOXEL_SIZE = 0.5;

export const VOXEL_MATERIALS = [
  { id: 'concrete', label: 'Concrete', color: 0x9a9a94, roughness: 0.85, metalness: 0.05 },
  { id: 'brick', label: 'Brick', color: 0x8a4a35, roughness: 0.8, metalness: 0.05 },
  { id: 'wood', label: 'Wood', color: 0x8a6a4a, roughness: 0.75, metalness: 0 },
  { id: 'steel', label: 'Steel', color: 0x6b7078, roughness: 0.4, metalness: 0.6 },
  { id: 'glass', label: 'Glass', color: 0x9fd6e8, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.55 },
  { id: 'stone', label: 'Stone', color: 0x7a7a72, roughness: 0.9, metalness: 0 },
  { id: 'grass', label: 'Foliage', color: 0x5a8a45, roughness: 0.85, metalness: 0 },
  { id: 'gold', label: 'Gold Trim', color: 0xd9b84a, roughness: 0.3, metalness: 0.8 },
  { id: 'water', label: 'Water', color: 0x2f7fb0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.75 },
  { id: 'marble', label: 'Marble', color: 0xe8e4da, roughness: 0.25, metalness: 0.05 },
  { id: 'sand', label: 'Sand', color: 0xd9c48a, roughness: 1, metalness: 0 },
  { id: 'neon', label: 'Neon Trim', color: 0xff3ec8, roughness: 0.3, metalness: 0.1, emissive: 0xff3ec8, emissiveIntensity: 0.9 },
];

export function voxelMaterialDef(id) { return VOXEL_MATERIALS.find(m => m.id === id) || VOXEL_MATERIALS[0]; }
