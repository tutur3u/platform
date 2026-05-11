import type { HiveCatalogItem } from './types';

export const terrainCatalog: HiveCatalogItem[] = [
  {
    category: 'terrain',
    color: '#8fbf4f',
    id: 'grass',
    label: 'Grass',
    tool: 'terrain',
  },
  {
    category: 'terrain',
    color: '#d9b66f',
    id: 'path',
    label: 'Path',
    tool: 'terrain',
  },
  {
    category: 'terrain',
    color: '#7aa758',
    id: 'garden',
    label: 'Garden',
    tool: 'terrain',
  },
  {
    category: 'terrain',
    color: '#7db4d9',
    id: 'water',
    label: 'Water',
    tool: 'terrain',
  },
];

export const objectCatalog: HiveCatalogItem[] = [
  {
    category: 'building',
    color: '#4d8ed8',
    id: 'house',
    label: 'House',
    tool: 'object',
  },
  {
    category: 'building',
    color: '#7fa94d',
    id: 'tree',
    label: 'Tree',
    tool: 'object',
  },
  {
    category: 'functional',
    color: '#b97b46',
    id: 'fence',
    label: 'Fence',
    tool: 'object',
  },
  {
    category: 'functional',
    color: '#6ea94d',
    id: 'crop',
    label: 'Crop',
    tool: 'object',
  },
];

export const npcCatalog: HiveCatalogItem[] = [
  {
    category: 'functional',
    color: '#c89b45',
    id: 'resident',
    label: 'NPC',
    tool: 'npc',
  },
];

export function getTerrainColor(type: string) {
  return terrainCatalog.find((item) => item.id === type)?.color ?? '#8fbf4f';
}

export function getTerrainSideColor(type: string) {
  if (type === 'water') return '#5f91b5';
  if (type === 'path') return '#9a7846';
  if (type === 'garden') return '#6f4b31';
  return '#6f8e3f';
}
