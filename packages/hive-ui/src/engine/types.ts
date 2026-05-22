import type {
  HiveBlock,
  HiveJsonObject,
  HiveNpc,
  HiveObject,
  HiveRealtimeAwareness,
  HiveServer,
  HiveSnapshotResponse,
  HiveVector3,
  HiveWorldData,
  HiveWorldEvent,
} from '@tuturuuu/internal-api/hive';

export type {
  HiveBlock,
  HiveJsonObject,
  HiveNpc,
  HiveObject,
  HiveRealtimeAwareness,
  HiveServer,
  HiveSnapshotResponse,
  HiveVector3,
  HiveWorldData,
  HiveWorldEvent,
};

export type HiveTool = 'select' | 'build' | 'erase' | 'move' | 'rotate';

export type HiveBuildMode = 'npc' | 'object' | 'terrain';

export type HiveBuildInfo = {
  commitHash: string | null;
  commitMessage: string | null;
  version: string;
};

export type HiveTimeTheme =
  | 'afternoon'
  | 'evening'
  | 'midnight'
  | 'morning'
  | 'noon';

export type HiveCameraView = 'close' | 'isometric' | 'topDown' | 'wide';

export type HiveSeason = 'autumn' | 'spring' | 'summer' | 'winter';

export type HiveWeather =
  | 'clear'
  | 'cloudy'
  | 'fog'
  | 'rain'
  | 'snow'
  | 'storm';

export type HiveCatalogItem = {
  category: 'building' | 'functional' | 'terrain';
  color: string;
  description?: string;
  footprint?: {
    autoExpandTerrain?: boolean;
    depth: number;
    width: number;
  };
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
