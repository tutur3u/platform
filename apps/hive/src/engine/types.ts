import type {
  HiveBlock,
  HiveNpc,
  HiveObject,
  HiveServer,
  HiveSnapshotResponse,
  HiveVector3,
  HiveWorldData,
  HiveWorldEvent,
} from '@tuturuuu/internal-api';

export type {
  HiveBlock,
  HiveNpc,
  HiveObject,
  HiveServer,
  HiveSnapshotResponse,
  HiveVector3,
  HiveWorldData,
  HiveWorldEvent,
};

export type HiveTool =
  | 'select'
  | 'terrain'
  | 'object'
  | 'npc'
  | 'erase'
  | 'move'
  | 'rotate';

export type HiveCatalogItem = {
  category: 'building' | 'functional' | 'terrain';
  color: string;
  id: string;
  label: string;
  tool: HiveTool;
};

export type HiveSelection =
  | { id: string; kind: 'block' }
  | { id: string; kind: 'npc' }
  | { id: string; kind: 'object' }
  | null;

export type HiveUser = {
  email?: string | null;
  id: string;
};
