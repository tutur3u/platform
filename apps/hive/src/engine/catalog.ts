import type { HiveCatalogItem } from './types';

export const terrainCatalog: HiveCatalogItem[] = [
  {
    category: 'terrain',
    color: '#8fbf4f',
    description: 'Default settlement tile',
    id: 'grass',
    label: 'Grass',
    shortcut: '1',
    tool: 'build',
  },
  {
    category: 'terrain',
    color: '#d9b66f',
    description: 'Walkable road tile',
    id: 'path',
    label: 'Path',
    shortcut: '2',
    tool: 'build',
  },
  {
    category: 'terrain',
    color: '#6b4a2f',
    description: 'Exposed ground',
    id: 'dirt',
    label: 'Dirt',
    shortcut: '3',
    tool: 'build',
  },
  {
    category: 'terrain',
    color: '#7db4d9',
    description: 'Shallow water',
    id: 'water',
    label: 'Water',
    shortcut: '4',
    tool: 'build',
  },
  {
    category: 'terrain',
    color: '#7aa758',
    description: 'Cultivated garden',
    id: 'garden',
    label: 'Garden',
    shortcut: '5',
    tool: 'build',
  },
  {
    category: 'terrain',
    color: '#a7a79c',
    description: 'Hardscape tile',
    id: 'stone',
    label: 'Stone',
    shortcut: '6',
    tool: 'build',
  },
  {
    category: 'terrain',
    color: '#dccb8a',
    description: 'Soft edge tile',
    id: 'sand',
    label: 'Sand',
    shortcut: '7',
    tool: 'build',
  },
  {
    category: 'terrain',
    color: '#a3c95f',
    description: 'Raised grass block',
    id: 'raised-grass',
    label: 'Raised',
    shortcut: '8',
    tool: 'build',
  },
  {
    category: 'terrain',
    color: '#8d6539',
    description: 'Soil for crops',
    id: 'crop-soil',
    label: 'Soil',
    shortcut: '9',
    tool: 'build',
  },
];

export const objectCatalog: HiveCatalogItem[] = [
  {
    category: 'building',
    color: '#4d8ed8',
    description: 'Resident building',
    id: 'house',
    label: 'House',
    shortcut: 'H',
    tool: 'build',
  },
  {
    category: 'building',
    color: '#7fa94d',
    description: 'Two-tier voxel tree',
    id: 'tree',
    label: 'Tree',
    shortcut: 'T',
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#b97b46',
    description: 'Boundary segment',
    id: 'fence',
    label: 'Fence',
    shortcut: 'F',
    stackable: true,
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#6ea94d',
    description: 'Requires soil or garden, tracks growth rate',
    id: 'crop',
    label: 'Crop',
    shortcut: 'C',
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#b58b46',
    description: 'Shared item storage for settlement inventory',
    id: 'warehouse',
    label: 'Warehouse',
    shortcut: 'A',
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#d29a4a',
    description: 'NPC trading counter for currency and item exchange',
    id: 'market-stall',
    label: 'Market',
    shortcut: 'M',
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#8a9aa3',
    description: 'Bulk crop and seed storage',
    id: 'storage-silo',
    label: 'Silo',
    shortcut: 'O',
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#5d8a48',
    description: 'Turns organic waste into fertilizer',
    id: 'compost-bin',
    label: 'Compost',
    shortcut: 'Q',
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#c3a04f',
    description: 'Protects crops and marks farm plots',
    id: 'scarecrow',
    label: 'Scarecrow',
    shortcut: 'R',
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#bc6fc5',
    description: 'Decorative crop with harvest value',
    id: 'flower-crop',
    label: 'Flowers',
    shortcut: 'V',
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#8b6b43',
    description: 'Tool storage for farm actions',
    id: 'tool-rack',
    label: 'Tools',
    shortcut: 'U',
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#7fb56a',
    description: 'Accelerates crop growth in adjacent tiles',
    id: 'greenhouse',
    label: 'Greenhouse',
    shortcut: 'G',
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#5f7c8a',
    description: 'Observability marker for experiment metrics',
    id: 'sensor',
    label: 'Sensor',
    shortcut: 'Y',
    stackable: true,
    tool: 'build',
  },
  {
    category: 'building',
    color: '#b76b55',
    description: 'Agent workplace for algorithmic NPCs',
    id: 'workshop',
    label: 'Workshop',
    shortcut: 'P',
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#96988f',
    description: 'Small obstacle',
    id: 'rock',
    label: 'Rock',
    shortcut: 'K',
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#8a6338',
    description: 'Spans water',
    id: 'bridge',
    label: 'Bridge',
    shortcut: 'J',
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#e5c65a',
    description: 'Light marker',
    id: 'lamp',
    label: 'Lamp',
    shortcut: 'L',
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#9a7b54',
    description: 'Settlement utility',
    id: 'well',
    label: 'Well',
    shortcut: 'W',
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#d2a84c',
    description: 'Experiment marker',
    id: 'marker',
    label: 'Marker',
    shortcut: 'I',
    tool: 'build',
  },
  {
    category: 'functional',
    color: '#c89b45',
    description: 'NPC spawn point',
    id: 'npc-spawn',
    label: 'Spawn',
    shortcut: 'S',
    tool: 'build',
  },
];

export const npcCatalog: HiveCatalogItem[] = [
  {
    category: 'functional',
    color: '#c89b45',
    id: 'resident',
    label: 'NPC',
    tool: 'build',
  },
];

export function getTerrainColor(type: string) {
  return terrainCatalog.find((item) => item.id === type)?.color ?? '#8fbf4f';
}

export function getTerrainSideColor(type: string) {
  if (type === 'water') return '#5f91b5';
  if (type === 'path') return '#9a7846';
  if (type === 'dirt') return '#523720';
  if (type === 'garden') return '#6f4b31';
  if (type === 'stone') return '#77786f';
  if (type === 'sand') return '#bfa96c';
  if (type === 'raised-grass') return '#6f9a42';
  if (type === 'crop-soil') return '#664629';
  return '#6f8e3f';
}

export function getTerrainHeight(type: string) {
  if (type === 'raised-grass') return 0.34;
  if (type === 'water') return 0.1;
  return 0.18;
}

export function getObjectCatalogItem(type: string) {
  return objectCatalog.find((item) => item.id === type);
}
