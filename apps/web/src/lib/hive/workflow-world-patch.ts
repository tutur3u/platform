import type { Json } from '@tuturuuu/types/db';
import type { HiveVector, HiveWorld } from './types';

type WorldPatchCapabilities = {
  getSnapshot: (serverId: string) => Promise<unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value: unknown) {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(number) ? number : null;
}

function toHiveVector(value: unknown): HiveVector | null {
  if (!isRecord(value)) return null;

  const x = toFiniteNumber(value.x);
  const y = toFiniteNumber(value.y);
  const z = toFiniteNumber(value.z);

  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

function toJsonRecord(value: unknown) {
  if (!isRecord(value)) return undefined;
  return Object.fromEntries(Object.entries(value)) as Record<
    string,
    Json | undefined
  >;
}

function getBlockId(position: HiveVector) {
  return `block:${position.x}:${position.y}:${position.z}`;
}

function getObjectId(type: string, position: HiveVector) {
  return `object:${type}:${position.x}:${position.y}:${position.z}:workflow`;
}

function normalizeHiveBlock(
  value: unknown
): HiveWorld['blocks'][number] | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  const position = toHiveVector(value.position);
  if (!position) return null;

  const state = toJsonRecord(value.state);
  const block: HiveWorld['blocks'][number] = {
    id: typeof value.id === 'string' ? value.id : getBlockId(position),
    position,
    type: value.type,
  };

  if (state) block.state = state;

  return block;
}

function normalizeHiveObject(
  value: unknown
): HiveWorld['objects'][number] | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  const position = toHiveVector(value.position);
  if (!position) return null;

  const rotation = toFiniteNumber(value.rotation);
  const state = toJsonRecord(value.state);
  const object: HiveWorld['objects'][number] = {
    id:
      typeof value.id === 'string'
        ? value.id
        : getObjectId(value.type, position),
    position,
    type: value.type,
  };

  if (rotation !== null) object.rotation = rotation;
  if (state) object.state = state;

  return object;
}

function normalizeHiveWorld(value: unknown): HiveWorld {
  if (!isRecord(value)) return { blocks: [], objects: [] };

  return {
    blocks: Array.isArray(value.blocks)
      ? value.blocks.flatMap((block) => {
          const normalized = normalizeHiveBlock(block);
          return normalized ? [normalized] : [];
        })
      : [],
    objects: Array.isArray(value.objects)
      ? value.objects.flatMap((object) => {
          const normalized = normalizeHiveObject(object);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

function getSnapshotWorld(snapshot: unknown) {
  return isRecord(snapshot) ? snapshot.world : undefined;
}

function toStringSet(value: unknown) {
  if (!Array.isArray(value)) return new Set<string>();
  return new Set(value.filter((entry) => typeof entry === 'string'));
}

export function applyHiveWorkflowWorldPatch(
  world: unknown,
  patch: unknown
): HiveWorld {
  const normalizedWorld =
    isRecord(patch) && patch.clear === true
      ? { blocks: [], objects: [] }
      : normalizeHiveWorld(world);
  const blockMap = new Map(
    normalizedWorld.blocks.map((block) => [block.id, block] as const)
  );
  const objectMap = new Map(
    normalizedWorld.objects.map((object) => [object.id, object] as const)
  );

  if (!isRecord(patch)) {
    return {
      blocks: [...blockMap.values()],
      objects: [...objectMap.values()],
    };
  }

  for (const blockId of toStringSet(patch.removeBlockIds)) {
    blockMap.delete(blockId);
  }

  for (const objectId of toStringSet(patch.removeObjectIds)) {
    objectMap.delete(objectId);
  }

  if (Array.isArray(patch.blocks)) {
    for (const block of patch.blocks) {
      const normalized = normalizeHiveBlock(block);
      if (normalized) blockMap.set(normalized.id, normalized);
    }
  }

  if (Array.isArray(patch.objects)) {
    for (const object of patch.objects) {
      const normalized = normalizeHiveObject(object);
      if (normalized) objectMap.set(normalized.id, normalized);
    }
  }

  return {
    blocks: [...blockMap.values()],
    objects: [...objectMap.values()],
  };
}

export async function getHiveWorkflowWorldEventConfig(input: {
  capabilities: WorldPatchCapabilities;
  config: Record<string, unknown>;
  serverId: string;
}) {
  const { capabilities, config, serverId } = input;
  const { worldPatch, ...eventConfig } = config;
  if (!isRecord(worldPatch)) return config;

  const snapshot = await capabilities.getSnapshot(serverId);
  return {
    ...eventConfig,
    world: applyHiveWorkflowWorldPatch(getSnapshotWorld(snapshot), worldPatch),
  };
}
