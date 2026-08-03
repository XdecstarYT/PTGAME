import { buildFamousDesign } from './stationLayoutGenerator.js';

// A starter gallery of station designs loosely inspired by famous real-world
// terminals (Southern Cross, Flinders Street, Grand Central, etc) - not
// attempts at exact architectural replicas, just recognizably-themed
// layouts/tiers/styles built with this designer's own painting tools, so
// new players have a set of grand, ready-to-place stations instead of a
// blank gallery. Seeded into StationCatalog once - see stationCatalog.js.
const FAMOUS_STATION_SPECS = [
  {
    name: 'Southern Cross Station (Melbourne)', typeId: 'subway', tierId: 'mega', architectureStyleId: 'modern',
    platformCount: 6, entranceCount: 4, amenities: ['kiosk', 'kiosk', 'restroom', 'bench', 'bench', 'info_board'],
  },
  {
    name: 'Flinders Street Station (Melbourne)', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'restroom', 'bench', 'info_board'],
  },
  {
    name: 'Melbourne Central Station', typeId: 'subway', tierId: 'medium', architectureStyleId: 'modern',
    platformCount: 2, entranceCount: 2, amenities: ['kiosk', 'bench'],
  },
  {
    name: 'Bourke Street Mall Tram Interchange (Melbourne)', typeId: 'tram_stop', tierId: 'medium', architectureStyleId: 'minimal',
    platformCount: 2, entranceCount: 2, amenities: ['bench', 'info_board'],
  },
  {
    name: 'Grand Central Terminal (New York)', typeId: 'subway', tierId: 'mega', architectureStyleId: 'heritage',
    platformCount: 6, entranceCount: 4, amenities: ['kiosk', 'kiosk', 'restroom', 'restroom', 'bench', 'info_board'],
  },
  {
    name: "King's Cross Station (London)", typeId: 'subway', tierId: 'large', architectureStyleId: 'modern',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'bench', 'info_board'],
  },
  {
    name: 'St Pancras International (London)', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'restroom', 'bench'],
  },
  {
    name: 'Gare du Nord (Paris)', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'bench', 'info_board'],
  },
  {
    name: 'Tokyo Station (Marunouchi)', typeId: 'subway', tierId: 'mega', architectureStyleId: 'heritage',
    platformCount: 5, entranceCount: 4, amenities: ['kiosk', 'kiosk', 'restroom', 'bench', 'info_board'],
  },
  {
    name: 'Shinjuku Station (Tokyo)', typeId: 'subway', tierId: 'mega', architectureStyleId: 'futuristic',
    platformCount: 6, entranceCount: 5, amenities: ['kiosk', 'kiosk', 'restroom', 'bench', 'bench', 'info_board'],
  },
  {
    name: 'Kyoto Station', typeId: 'subway', tierId: 'mega', architectureStyleId: 'futuristic',
    platformCount: 5, entranceCount: 4, amenities: ['kiosk', 'restroom', 'bench', 'info_board'],
  },
  {
    name: 'Zürich Hauptbahnhof', typeId: 'subway', tierId: 'large', architectureStyleId: 'minimal',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'bench'],
  },
  {
    name: 'Antwerp Centraal ("Railway Cathedral")', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 3, entranceCount: 3, amenities: ['kiosk', 'restroom', 'bench'],
  },
  {
    name: 'Berlin Hauptbahnhof', typeId: 'subway', tierId: 'mega', architectureStyleId: 'futuristic',
    platformCount: 6, entranceCount: 4, amenities: ['kiosk', 'kiosk', 'restroom', 'bench', 'info_board'],
  },
  {
    name: 'Union Station (Washington, D.C.)', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'restroom', 'bench', 'info_board'],
  },
];

export function famousStationDesigns() {
  return FAMOUS_STATION_SPECS.map(buildFamousDesign);
}
