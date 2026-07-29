// Regional regulation presets. Switching the *active* ruleset (a city-wide
// setting, see main.js) re-checks every design/instance live; non-compliant
// designs stay usable but get flagged everywhere they show up.

export const REGULATION_PRESETS = [
  {
    id: 'continental', label: 'Continental',
    minDoors: 2, minAccessibleBays: 1, minAisleWidthCm: 80, maxStepHeightCm: 20,
  },
  {
    id: 'transatlantic', label: 'Transatlantic',
    minDoors: 1, minAccessibleBays: 1, minAisleWidthCm: 85, maxStepHeightCm: 30,
  },
  {
    id: 'minimal', label: 'Minimal / Generic',
    minDoors: 1, minAccessibleBays: 0, minAisleWidthCm: 60, maxStepHeightCm: 40,
  },
];

export function regulationById(id) { return REGULATION_PRESETS.find(r => r.id === id) || REGULATION_PRESETS[2]; }

// stats = { doorCount, accessibleBays, aisleWidthCm, stepHeightCm }
export function checkCompliance(stats, ruleset) {
  const violations = [];
  if (stats.doorCount < ruleset.minDoors) violations.push(`Needs at least ${ruleset.minDoors} door(s) (has ${stats.doorCount})`);
  if (stats.accessibleBays < ruleset.minAccessibleBays) violations.push(`Needs at least ${ruleset.minAccessibleBays} accessible bay(s) (has ${stats.accessibleBays})`);
  if (stats.aisleWidthCm < ruleset.minAisleWidthCm) violations.push(`Aisle too narrow: ${stats.aisleWidthCm}cm < ${ruleset.minAisleWidthCm}cm minimum`);
  if (stats.stepHeightCm > ruleset.maxStepHeightCm) violations.push(`Step too high: ${stats.stepHeightCm}cm > ${ruleset.maxStepHeightCm}cm maximum`);
  return { compliant: violations.length === 0, violations };
}
