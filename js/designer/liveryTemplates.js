// One-click brand color schemes - applies primary/secondary/roof/skirt
// colors and a pattern all at once, leaving identity fields (operator name,
// logo) untouched since those are what make a livery "yours" even when it
// starts from a template. roof/skirt only matter for passenger vehicles
// (freight has no distinct roof/skirt mesh zone), so freight applications
// just ignore those two fields.
export const LIVERY_TEMPLATES = [
  {
    id: 'city_blue', name: 'City Transit Blue', pattern: 'stripe',
    primary: '#2a5d9f', secondary: '#f4f0ff', roof: '#1c2b3d', skirt: '#12151c',
  },
  {
    id: 'eco_green', name: 'Eco Green', pattern: 'twotone',
    primary: '#3a8f5c', secondary: '#e8f4e0', roof: '#1f3d2a', skirt: '#121a15',
  },
  {
    id: 'sunset_express', name: 'Sunset Express', pattern: 'stripe',
    primary: '#e0703a', secondary: '#ffe0a8', roof: '#3d2214', skirt: '#1a1008',
  },
  {
    id: 'monochrome', name: 'Monochrome', pattern: 'solid',
    primary: '#2a2a2e', secondary: '#8a8a90', roof: '#151517', skirt: '#0a0a0b',
  },
  {
    id: 'heritage_maroon', name: 'Heritage Maroon', pattern: 'twotone',
    primary: '#7a2530', secondary: '#f0d9a8', roof: '#2a0f13', skirt: '#150a0b',
  },
  {
    id: 'safety_yellow', name: 'Safety Yellow', pattern: 'stripe',
    primary: '#d9b32a', secondary: '#1a1a1a', roof: '#3d3410', skirt: '#141208',
  },
];

export function liveryTemplateById(id) { return LIVERY_TEMPLATES.find(t => t.id === id); }
