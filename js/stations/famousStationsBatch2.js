import { buildFamousDesign } from './stationLayoutGenerator.js';

// Second starter-gallery batch (see famousStations.js for the first) -
// more famous-terminal-inspired designs, seeded once alongside the first
// batch under its own persisted flag (see stationCatalog.js).
const FAMOUS_STATION_SPECS_2 = [
  {
    name: 'Central Station (Sydney)', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'restroom', 'bench', 'info_board'],
  },
  {
    name: 'Wynyard Station (Sydney)', typeId: 'subway', tierId: 'medium', architectureStyleId: 'minimal',
    platformCount: 2, entranceCount: 2, amenities: ['bench', 'info_board'],
  },
  {
    name: 'Elizabeth Street Bus & Tram Interchange (Melbourne)', typeId: 'tram_stop', tierId: 'medium', architectureStyleId: 'minimal',
    platformCount: 2, entranceCount: 2, amenities: ['bench', 'kiosk'],
  },
  {
    name: 'Adelaide Railway Station', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 3, entranceCount: 3, amenities: ['kiosk', 'bench', 'info_board'],
  },
  {
    name: 'Waterloo Station (London)', typeId: 'subway', tierId: 'mega', architectureStyleId: 'modern',
    platformCount: 6, entranceCount: 5, amenities: ['kiosk', 'kiosk', 'restroom', 'bench', 'bench', 'info_board'],
  },
  {
    name: 'Liverpool Street Station (London)', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'restroom', 'bench'],
  },
  {
    name: 'Victoria Station (London)', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'bench', 'info_board'],
  },
  {
    name: 'Paddington Station (London)', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'restroom', 'bench'],
  },
  {
    name: 'Gare de Lyon (Paris)', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'bench', 'info_board'],
  },
  {
    name: 'Amsterdam Centraal', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'restroom', 'bench', 'info_board'],
  },
  {
    name: 'Milano Centrale', typeId: 'subway', tierId: 'mega', architectureStyleId: 'heritage',
    platformCount: 6, entranceCount: 4, amenities: ['kiosk', 'kiosk', 'restroom', 'bench', 'info_board'],
  },
  {
    name: 'Los Angeles Union Station', typeId: 'subway', tierId: 'large', architectureStyleId: 'minimal',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'bench', 'info_board'],
  },
  {
    name: 'Toronto Union Station', typeId: 'subway', tierId: 'large', architectureStyleId: 'heritage',
    platformCount: 4, entranceCount: 3, amenities: ['kiosk', 'restroom', 'bench'],
  },
  {
    name: 'Seoul Station', typeId: 'subway', tierId: 'mega', architectureStyleId: 'futuristic',
    platformCount: 5, entranceCount: 4, amenities: ['kiosk', 'kiosk', 'restroom', 'bench', 'info_board'],
  },
  {
    name: 'Shanghai Hongqiao Railway Station', typeId: 'subway', tierId: 'mega', architectureStyleId: 'futuristic',
    platformCount: 6, entranceCount: 5, amenities: ['kiosk', 'kiosk', 'restroom', 'bench', 'bench', 'info_board'],
  },
];

export function famousStationDesignsBatch2() {
  return FAMOUS_STATION_SPECS_2.map(buildFamousDesign);
}
