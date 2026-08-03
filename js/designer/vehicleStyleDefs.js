// Additional customization axes for the Vehicle Designer, layered on top of
// the existing chassis/powertrain/livery/features system - each one is a
// real functional trade-off (cost/comfort/reliability/speed folded into
// computeStats(), same as featureDefs.js) rather than a purely cosmetic
// checkbox, with one exception (hornStyle, a pure audio cue with no stat).
//
// Storage: wheelStyle/headlightStyle/roofAccessory live under model.exterior
// (a new grouping); windowTint/fleetNumber live under model.livery (the same
// bucket roof/skirt/operatorName already sit in - it's still "paint job"
// territory); seatMaterial/seatColor live under model.interiorStyle;
// hornStyle is its own top-level model field.

export const WHEEL_STYLES = [
  { id: 'steel', label: 'Steel Wheels', hubColor: 0xc9ccd1, hubMetalness: 0.7, hubRoughness: 0.35, costPerCar: 0, comfortBonus: 0, reliabilityBonus: 0, speedBonusPct: 0 },
  { id: 'alloy', label: 'Alloy Rims', hubColor: 0xe8e8e8, hubMetalness: 0.85, hubRoughness: 0.2, costPerCar: 400, comfortBonus: 0, reliabilityBonus: 1, speedBonusPct: 0 },
  { id: 'sport', label: 'Sport Rims', hubColor: 0x1a1a1a, hubMetalness: 0.6, hubRoughness: 0.3, costPerCar: 900, comfortBonus: 0, reliabilityBonus: 0, speedBonusPct: 2 },
  { id: 'covered', label: 'Covered Hubs', hubColor: 0x9aa0a6, hubMetalness: 0.3, hubRoughness: 0.5, costPerCar: 250, comfortBonus: 1, reliabilityBonus: 0, speedBonusPct: 0 },
];
export function wheelStyleById(id) { return WHEEL_STYLES.find(w => w.id === id) || WHEEL_STYLES[0]; }

export const HEADLIGHT_STYLES = [
  { id: 'round', label: 'Round Sealed-Beam', costPerCar: 0, comfortBonus: 0 },
  { id: 'led_strip', label: 'LED Strip', costPerCar: 300, comfortBonus: 1 },
  { id: 'projector', label: 'Projector', costPerCar: 600, comfortBonus: 2 },
];
export function headlightStyleById(id) { return HEADLIGHT_STYLES.find(h => h.id === id) || HEADLIGHT_STYLES[0]; }

// roof_rack only renders on bus-category chassis; scissor_pantograph only
// replaces the automatic single-arm pantograph on electric trams/subways -
// picking one that doesn't apply to a given chassis just has no visual
// effect (graceful no-op), same tolerance the Features roof props already have.
export const ROOF_ACCESSORIES = [
  { id: 'none', label: 'None', costPerCar: 0, comfortBonus: 0, reliabilityBonus: 0 },
  { id: 'roof_rack', label: 'Roof Luggage Rack (bus)', costPerCar: 500, comfortBonus: 1, reliabilityBonus: 0 },
  { id: 'scissor_pantograph', label: 'Scissor Pantograph (electric rail/tram)', costPerCar: 300, comfortBonus: 0, reliabilityBonus: 1 },
];
export function roofAccessoryById(id) { return ROOF_ACCESSORIES.find(r => r.id === id) || ROOF_ACCESSORIES[0]; }

export const WINDOW_TINTS = [
  { id: 'clear', label: 'Clear', color: 0x1a2230, opacity: 0.72, costPerCar: 0, comfortBonus: 0 },
  { id: 'light', label: 'Light Tint', color: 0x162030, opacity: 0.6, costPerCar: 80, comfortBonus: 1 },
  { id: 'dark', label: 'Dark Tint', color: 0x0d1420, opacity: 0.45, costPerCar: 150, comfortBonus: 2 },
  { id: 'mirror', label: 'Mirror Tint', color: 0x4a5a66, opacity: 0.35, costPerCar: 300, comfortBonus: 1 },
];
export function windowTintById(id) { return WINDOW_TINTS.find(w => w.id === id) || WINDOW_TINTS[0]; }

export const SEAT_MATERIALS = [
  { id: 'fabric', label: 'Fabric', roughness: 0.7, metalness: 0, costPerCar: 0, comfortBonus: 0, reliabilityBonus: 0 },
  { id: 'vinyl', label: 'Vinyl (easy-clean)', roughness: 0.45, metalness: 0.05, costPerCar: 100, comfortBonus: -1, reliabilityBonus: 1 },
  { id: 'leather', label: 'Leather', roughness: 0.3, metalness: 0.05, costPerCar: 800, comfortBonus: 2, reliabilityBonus: 0 },
  { id: 'premium', label: 'Premium Cushioned', roughness: 0.55, metalness: 0, costPerCar: 1500, comfortBonus: 3, reliabilityBonus: 0 },
];
export function seatMaterialById(id) { return SEAT_MATERIALS.find(s => s.id === id) || SEAT_MATERIALS[0]; }

// Pure audio flavor - no stat effect, consumed by audio.js's
// playArrivalChime(hornStyle) instead of computeStats().
export const HORN_STYLES = [
  { id: 'standard', label: 'Standard Chime' },
  { id: 'two_tone', label: 'Two-Tone Horn' },
  { id: 'air_horn', label: 'Air Horn' },
  { id: 'electronic_chime', label: 'Soft Electronic Chime' },
];
export function hornStyleById(id) { return HORN_STYLES.find(h => h.id === id) || HORN_STYLES[0]; }
