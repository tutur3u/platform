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
  description?: string;
  id: string;
  label: string;
  shortcut?: string;
  stackable?: boolean;
  tool: HiveTool;
};

export type HiveSelection =
  | { id: string; kind: 'block' }
  | { id: string; kind: 'npc' }
  | { id: string; kind: 'object' }
  | null;

export type HiveUser = {
  avatarUrl?: string | null;
  displayName?: string | null;
  email?: string | null;
  handle?: string | null;
  id: string;
};
