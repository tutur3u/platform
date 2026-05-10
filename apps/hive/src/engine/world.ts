import type {
  HiveBlock,
  HiveNpc,
  HiveObject,
  HiveSelection,
  HiveVector3,
  HiveWorldData,
} from './types';

export const GRID_SIZE = 12;

export function makeBlockId(position: HiveVector3) {
  return `block:${position.x}:${position.y}:${position.z}`;
}

export function makeObjectId(type: string, position: HiveVector3) {
  return `object:${type}:${position.x}:${position.y}:${position.z}:${Date.now()}`;
}

export function snapVector(value: HiveVector3): HiveVector3 {
  return {
    x: Math.round(value.x),
    y: Math.max(0, Math.round(value.y)),
    z: Math.round(value.z),
  };
}

export function createDefaultWorld(): HiveWorldData {
  const blocks: HiveBlock[] = [];

  for (let x = -4; x <= 5; x += 1) {
    for (let z = -4; z <= 5; z += 1) {
      const isPath = x === 0 || z === 0;
      blocks.push({
        id: makeBlockId({ x, y: 0, z }),
        position: { x, y: 0, z },
        type: isPath ? 'path' : 'grass',
      });
    }
  }

  return {
    blocks,
    objects: [
      {
        id: 'object:house:seed',
        position: { x: -2, y: 1, z: -2 },
        type: 'house',
      },
      {
        id: 'object:tree:seed:a',
        position: { x: 3, y: 1, z: -3 },
        type: 'tree',
      },
      {
        id: 'object:crop:seed:a',
        position: { x: 3, y: 1, z: 3 },
        type: 'crop',
      },
      {
        id: 'object:fence:seed:a',
        position: { x: 2, y: 1, z: 2 },
        type: 'fence',
      },
    ],
  };
}

export function upsertBlock(
  world: HiveWorldData,
  position: HiveVector3,
  type: string
): HiveWorldData {
  const snapped = snapVector(position);
  const id = makeBlockId(snapped);
  const existing = world.blocks.some((block) => block.id === id);

  return {
    ...world,
    blocks: existing
      ? world.blocks.map((block) =>
          block.id === id ? { ...block, position: snapped, type } : block
        )
      : [...world.blocks, { id, position: snapped, type }],
  };
}

export function addObject(
  world: HiveWorldData,
  position: HiveVector3,
  type: string
): HiveWorldData {
  const snapped = { ...snapVector(position), y: 1 };

  return {
    ...world,
    objects: [
      ...world.objects,
      {
        id: makeObjectId(type, snapped),
        position: snapped,
        type,
      },
    ],
  };
}

export function removeSelection(
  world: HiveWorldData,
  npcs: HiveNpc[],
  selection: HiveSelection
) {
  if (!selection) {
    return { npcs, world };
  }

  if (selection.kind === 'block') {
    return {
      npcs,
      world: {
        ...world,
        blocks: world.blocks.filter((block) => block.id !== selection.id),
      },
    };
  }

  if (selection.kind === 'object') {
    return {
      npcs,
      world: {
        ...world,
        objects: world.objects.filter((object) => object.id !== selection.id),
      },
    };
  }

  return {
    npcs: npcs.filter((npc) => npc.id !== selection.id),
    world,
  };
}

export function findSelectedEntity(
  world: HiveWorldData,
  npcs: HiveNpc[],
  selection: HiveSelection
): HiveBlock | HiveNpc | HiveObject | null {
  if (!selection) {
    return null;
  }

  if (selection.kind === 'block') {
    return world.blocks.find((block) => block.id === selection.id) ?? null;
  }

  if (selection.kind === 'object') {
    return world.objects.find((object) => object.id === selection.id) ?? null;
  }

  return npcs.find((npc) => npc.id === selection.id) ?? null;
}
