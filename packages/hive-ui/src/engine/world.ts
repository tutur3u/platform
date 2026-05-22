import type { Json } from '@tuturuuu/types/db';
import { getObjectCatalogItem } from './catalog';
import {
  getObjectFootprint,
  getObjectFootprintCells,
  objectFootprintsIntersect,
} from './footprint';
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
        id: 'object:cottage:seed:a',
        position: { x: 4, y: 1, z: -1 },
        rotation: 90,
        type: 'cottage',
      },
      {
        id: 'object:civic-hall:seed:a',
        position: { x: -3, y: 1, z: 3 },
        type: 'civic-hall',
      },
      {
        id: 'object:tree:seed:a',
        position: { x: 3, y: 1, z: -3 },
        type: 'tree',
      },
      {
        id: 'object:crop:seed:a',
        position: { x: 3, y: 1, z: 3 },
        state: createObjectState('crop'),
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

export function updateBlock(
  world: HiveWorldData,
  blockId: string,
  patch: Partial<Pick<HiveBlock, 'position' | 'state' | 'type'>>
) {
  const target = world.blocks.find((block) => block.id === blockId);
  if (!target) return world;

  const position = patch.position
    ? snapVector(patch.position)
    : target.position;
  const id = makeBlockId(position);

  if (id !== blockId && world.blocks.some((block) => block.id === id)) {
    return world;
  }

  return {
    ...world,
    blocks: world.blocks.map((block) =>
      block.id === blockId
        ? {
            ...block,
            id,
            position,
            ...(patch.state ? { state: patch.state } : {}),
            type: patch.type ?? block.type,
          }
        : block
    ),
  };
}

export function addObject(
  world: HiveWorldData,
  position: HiveVector3,
  type: string
): HiveWorldData {
  const snapped = { ...snapVector(position), y: 1 };
  const worldWithFootprintTerrain = ensureObjectFootprintTerrain(
    world,
    snapped,
    type
  );
  const canPlace = canPlaceObject(worldWithFootprintTerrain, snapped, type);

  if (!canPlace.allowed) {
    return world;
  }

  const catalogItem = getObjectCatalogItem(type);
  const stackable = catalogItem?.stackable ?? false;
  const state = createObjectState(type);
  const placementCells = getObjectFootprintCells({
    position: snapped,
    state,
    type,
  });

  return {
    ...worldWithFootprintTerrain,
    objects: [
      ...worldWithFootprintTerrain.objects.filter((object) => {
        if (stackable) return true;
        return !objectFootprintsIntersect(
          getObjectFootprintCells(object),
          placementCells
        );
      }),
      {
        id: makeObjectId(type, snapped),
        position: {
          ...snapped,
          y: getObjectPlacementY(worldWithFootprintTerrain, snapped, type),
        },
        ...(state ? { state } : {}),
        type,
      },
    ],
  };
}

export function createObjectState(
  type: string
): { [key: string]: Json | undefined } | undefined {
  if (type === 'crop') {
    return {
      health: 100,
      growthRate: 0.08,
      growthStage: 0.25,
      mode: 'seasonal',
      needsWater: true,
      plantedAt: new Date().toISOString(),
      yieldItem: 'turnip',
    };
  }

  if (type === 'flower-crop') {
    return {
      health: 100,
      growthRate: 0.05,
      growthStage: 0.2,
      mode: 'seasonal',
      needsWater: true,
      plantedAt: new Date().toISOString(),
      yieldItem: 'flowers',
    };
  }

  if (type === 'sensor') {
    return {
      metric: 'presence',
      sampleRateSeconds: 30,
      status: 'listening',
    };
  }

  if (type === 'greenhouse') {
    return {
      growthMultiplier: 1.4,
      radius: 2,
      status: 'active',
    };
  }

  if (type === 'workshop') {
    return {
      queueDepth: 0,
      role: 'algorithmic-agent-station',
    };
  }

  if (type === 'warehouse') {
    return {
      capacity: 500,
      storedItems: 0,
      status: 'accepting',
    };
  }

  if (type === 'market-stall') {
    return {
      openOffers: 0,
      status: 'open',
    };
  }

  if (type === 'compost-bin') {
    return {
      fertilizer: 0,
      status: 'idle',
    };
  }

  return undefined;
}

export function removeBlock(world: HiveWorldData, blockId: string) {
  const block = world.blocks.find((item) => item.id === blockId);

  return {
    ...world,
    blocks: world.blocks.filter((block) => block.id !== blockId),
    objects: block
      ? world.objects.filter(
          (object) =>
            !getObjectFootprintCells(object).some(
              (cell) =>
                cell.x === block.position.x && cell.z === block.position.z
            )
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
        ? {
            ...item,
            id: object.id,
            rotation: object.rotation,
            state: object.state,
          }
        : item
    ),
  };
}

export function rotateObject(world: HiveWorldData, objectId: string) {
  const target = world.objects.find((object) => object.id === objectId);
  if (!target) return world;

  const nextRotation = ((target.rotation ?? 0) + 90) % 360;
  const canRotate = canPlaceObject(world, target.position, target.type, {
    allowReplacement: false,
    ignoreObjectId: target.id,
    rotation: nextRotation,
  });

  if (!canRotate.allowed) {
    return world;
  }

  return {
    ...world,
    objects: world.objects.map((object) =>
      object.id === objectId ? { ...object, rotation: nextRotation } : object
    ),
  };
}

export function updateObject(
  world: HiveWorldData,
  objectId: string,
  patch: Partial<Pick<HiveObject, 'position' | 'rotation' | 'state'>>
) {
  const target = world.objects.find((object) => object.id === objectId);
  if (!target) return world;

  const snapped = patch.position
    ? { ...snapVector(patch.position), y: 1 }
    : target.position;
  const rotation =
    typeof patch.rotation === 'number'
      ? normalizeRotation(patch.rotation)
      : target.rotation;
  const canUpdate = canPlaceObject(world, snapped, target.type, {
    allowReplacement: false,
    ignoreObjectId: target.id,
    rotation,
  });

  if (!canUpdate.allowed) {
    return world;
  }

  return {
    ...world,
    objects: world.objects.map((object) =>
      object.id === objectId
        ? {
            ...object,
            position: {
              ...snapped,
              y: getObjectPlacementY(world, snapped, object.type),
            },
            rotation,
            ...(patch.state ? { state: patch.state } : {}),
          }
        : object
    ),
  };
}

export function canPlaceObject(
  world: HiveWorldData,
  position: HiveVector3,
  type: string,
  options: {
    allowReplacement?: boolean;
    ignoreObjectId?: string;
    rotation?: number;
  } = {}
): { allowed: boolean; reason?: string } {
  const snapped = snapVector(position);
  const cells = getObjectFootprintCells({
    position: snapped,
    rotation: options.rotation,
    type,
  });
  const blocksByCell = new Map(
    world.blocks.map((block) => [
      `${block.position.x}:${block.position.z}`,
      block,
    ])
  );
  const blocks = cells
    .map((cell) => blocksByCell.get(`${cell.x}:${cell.z}`) ?? null)
    .filter((block) => block !== null);

  if (blocks.length !== cells.length) {
    return { allowed: false, reason: 'Place a terrain tile first.' };
  }

  if (type === 'bridge' && blocks.some((block) => block.type !== 'water')) {
    return {
      allowed: false,
      reason: 'Bridge objects must be placed on water.',
    };
  }

  if (
    (type === 'crop' || type === 'flower-crop') &&
    blocks.some(
      (block) => block.type !== 'crop-soil' && block.type !== 'garden'
    )
  ) {
    return {
      allowed: false,
      reason: 'Crop objects require soil or garden terrain.',
    };
  }

  const catalogItem = getObjectCatalogItem(type);
  const stackable = catalogItem?.stackable ?? false;
  const occupied =
    !stackable &&
    world.objects.some(
      (object) =>
        object.id !== options.ignoreObjectId &&
        objectFootprintsIntersect(getObjectFootprintCells(object), cells)
    );

  if (occupied) {
    if (options.allowReplacement === false) {
      return {
        allowed: false,
        reason: 'This footprint overlaps another object.',
      };
    }

    return {
      allowed: true,
      reason: 'This placement replaces the existing object.',
    };
  }

  return { allowed: true };
}

function ensureObjectFootprintTerrain(
  world: HiveWorldData,
  position: HiveVector3,
  type: string
) {
  const footprint = getObjectFootprint(type);

  if (!footprint.autoExpandTerrain) {
    return world;
  }

  const anchorBlock = world.blocks.find(
    (block) =>
      block.position.x === position.x &&
      block.position.z === position.z &&
      block.position.y === 0
  );

  if (!anchorBlock) {
    return world;
  }

  const existing = new Set(
    world.blocks.map((block) => `${block.position.x}:${block.position.z}`)
  );
  const missingBlocks = getObjectFootprintCells({ position, type })
    .filter((cell) => !existing.has(`${cell.x}:${cell.z}`))
    .map((cell) => ({
      id: makeBlockId(cell),
      position: cell,
      type: anchorBlock.type,
    }));

  if (missingBlocks.length === 0) {
    return world;
  }

  return {
    ...world,
    blocks: [...world.blocks, ...missingBlocks],
  };
}

function getObjectPlacementY(
  world: HiveWorldData,
  position: HiveVector3,
  type: string
) {
  const cells = getObjectFootprintCells({ position, type });
  const raised = cells.some((cell) =>
    world.blocks.some(
      (block) =>
        block.position.x === cell.x &&
        block.position.z === cell.z &&
        block.type === 'raised-grass'
    )
  );

  return raised ? 1.16 : 1;
}

function normalizeRotation(rotation: number) {
  return ((Math.round(rotation) % 360) + 360) % 360;
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
