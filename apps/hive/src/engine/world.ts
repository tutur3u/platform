import { getObjectCatalogItem } from './catalog';
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
      const isGarden = x >= 2 && x <= 4 && z >= 2 && z <= 4;
      blocks.push({
        id: makeBlockId({ x, y: 0, z }),
        position: { x, y: 0, z },
        type: isGarden ? 'garden' : isPath ? 'path' : 'grass',
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

export function createEmptyWorld(): HiveWorldData {
  return {
    blocks: [],
    objects: [],
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
  const targetBlock = world.blocks.find(
    (block) =>
      block.position.x === snapped.x &&
      block.position.z === snapped.z &&
      block.position.y === 0
  );
  const canPlace = canPlaceObject(world, snapped, type);

  if (!canPlace.allowed) {
    return world;
  }

  const catalogItem = getObjectCatalogItem(type);
  const stackable = catalogItem?.stackable ?? false;

  return {
    ...world,
    objects: [
      ...world.objects.filter((object) => {
        if (stackable) return true;
        return (
          object.position.x !== snapped.x || object.position.z !== snapped.z
        );
      }),
      {
        id: makeObjectId(type, snapped),
        position: {
          ...snapped,
          y: targetBlock?.type === 'raised-grass' ? 1.16 : 1,
        },
        type,
      },
    ],
  };
}

export function removeBlock(world: HiveWorldData, blockId: string) {
  const block = world.blocks.find((item) => item.id === blockId);

  return {
    ...world,
    blocks: world.blocks.filter((block) => block.id !== blockId),
    objects: block
      ? world.objects.filter(
          (object) =>
            object.position.x !== block.position.x ||
            object.position.z !== block.position.z
        )
      : world.objects,
  };
}

export function removeObject(world: HiveWorldData, objectId: string) {
  return {
    ...world,
    objects: world.objects.filter((object) => object.id !== objectId),
  };
}

export function moveObject(
  world: HiveWorldData,
  objectId: string,
  position: HiveVector3
) {
  const object = world.objects.find((item) => item.id === objectId);
  if (!object) return world;
  const movedWorld = removeObject(world, objectId);
  const nextWorld = addObject(movedWorld, position, object.type);
  const movedObject = nextWorld.objects.at(-1);

  if (!movedObject || movedObject.type !== object.type) {
    return world;
  }

  return {
    ...nextWorld,
    objects: nextWorld.objects.map((item) =>
      item.id === movedObject.id
        ? { ...item, id: object.id, rotation: object.rotation }
        : item
    ),
  };
}

export function rotateObject(world: HiveWorldData, objectId: string) {
  return {
    ...world,
    objects: world.objects.map((object) =>
      object.id === objectId
        ? { ...object, rotation: ((object.rotation ?? 0) + 90) % 360 }
        : object
    ),
  };
}

export function canPlaceObject(
  world: HiveWorldData,
  position: HiveVector3,
  type: string
): { allowed: boolean; reason?: string } {
  const snapped = snapVector(position);
  const block = world.blocks.find(
    (item) =>
      item.position.x === snapped.x &&
      item.position.z === snapped.z &&
      item.position.y === 0
  );

  if (!block) {
    return { allowed: false, reason: 'Place a terrain tile first.' };
  }

  if (type === 'bridge' && block.type !== 'water') {
    return {
      allowed: false,
      reason: 'Bridge objects must be placed on water.',
    };
  }

  if (
    type === 'crop' &&
    block.type !== 'crop-soil' &&
    block.type !== 'garden'
  ) {
    return {
      allowed: false,
      reason: 'Crop objects require soil or garden terrain.',
    };
  }

  const catalogItem = getObjectCatalogItem(type);
  const occupied = world.objects.some(
    (object) =>
      object.position.x === snapped.x &&
      object.position.z === snapped.z &&
      !(catalogItem?.stackable ?? false)
  );

  if (occupied) {
    return {
      allowed: true,
      reason: 'This placement replaces the existing object.',
    };
  }

  return { allowed: true };
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
      world: removeBlock(world, selection.id),
    };
  }

  if (selection.kind === 'object') {
    return {
      npcs,
      world: removeObject(world, selection.id),
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
