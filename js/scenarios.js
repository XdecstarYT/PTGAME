const CUSTOM_STORAGE_KEY = 'ptgame_custom_scenarios_v1';

// Hand-authored maps with distinct shapes, on top of the procedural sandbox.
// Fixed seeds make each one reproducible (the "shape" comes from the
// scenario config's river/density multipliers, not the seed itself).
export const BUILTIN_SCENARIOS = [
  {
    id: 'sandbox', name: 'Procedural Sandbox', builtin: true,
    description: 'A fresh, randomly-seeded city every time - the standard open sandbox.',
    randomSeed: true, config: {},
  },
  {
    id: 'river_city', name: 'River City', builtin: true,
    description: 'A wide river splits the city in two - bridges and tunnels are precious, and surface routes need real planning to cross.',
    seed: 918273645, config: { riverAmplitudeMult: 1.8, riverWidthMult: 2.4, riverBaseXFrac: 0.5 },
  },
  {
    id: 'sprawl', name: 'Sprawling Suburbs', builtin: true,
    description: 'A huge, low-density residential sprawl around a small commercial core - raw coverage matters more than throughput.',
    seed: 42042042, config: { coreRadiusMult: 0.55, ringRadiusMult: 1.6, riverWidthMult: 0.6 },
  },
  {
    id: 'downtown', name: 'Dense Downtown Grid', builtin: true,
    description: 'A dense, tightly-packed commercial core surrounded by a thin residential ring - short, high-capacity lines win here.',
    seed: 77777777, config: { coreRadiusMult: 1.9, ringRadiusMult: 0.75 },
  },
];

function isValidScenario(s) {
  return s && typeof s === 'object' && typeof s.name === 'string' && typeof s.config === 'object';
}

export function listCustomScenarios() {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter(isValidScenario) : [];
  } catch (e) {
    return [];
  }
}

function saveCustomScenarios(list) {
  try { localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}

export function allScenarios() {
  return [...BUILTIN_SCENARIOS, ...listCustomScenarios()];
}

export function exportScenario(scenario) {
  const json = JSON.stringify(scenario, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${scenario.name.replace(/[^a-z0-9-_]+/gi, '_')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function importScenarioFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!isValidScenario(parsed)) throw new Error('That JSON does not look like a scenario definition.');
        parsed.id = `custom_${Date.now().toString(36)}`;
        parsed.builtin = false;
        const list = listCustomScenarios();
        list.push(parsed);
        saveCustomScenarios(list);
        resolve(parsed);
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsText(file);
  });
}

export function deleteCustomScenario(id) {
  saveCustomScenarios(listCustomScenarios().filter(s => s.id !== id));
}
