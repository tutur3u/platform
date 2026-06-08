import { getHiveAgentDestructiveWorldAction } from '@tuturuuu/realtime/hive';
import type { HiveVector3, HiveWorldData } from './types';
import {
  addObject,
  createDefaultWorld,
  createEmptyWorld,
  upsertBlock,
} from './world';

export type HiveAgentWorldResult = {
  actions: string[];
  changed: boolean;
  summary: string;
  world: HiveWorldData;
};

type HiveAgentInstructionOptions = {
  allowDestructiveWorldActions?: boolean;
};

const riverPath = Array.from({ length: 11 }, (_, index) => ({
  x: index - 5,
  y: 0,
  z: index % 3 === 0 ? -1 : 0,
}));

const roadPath = [
  ...Array.from({ length: 11 }, (_, index) => ({ x: index - 5, y: 0, z: 1 })),
  ...Array.from({ length: 9 }, (_, index) => ({ x: -1, y: 0, z: index - 4 })),
];

const farmTiles = [
  { x: -4, y: 0, z: -3 },
  { x: -3, y: 0, z: -3 },
  { x: -2, y: 0, z: -3 },
  { x: -4, y: 0, z: -2 },
  { x: -3, y: 0, z: -2 },
  { x: -2, y: 0, z: -2 },
  { x: 2, y: 0, z: 3 },
  { x: 3, y: 0, z: 3 },
  { x: 4, y: 0, z: 3 },
  { x: 2, y: 0, z: 4 },
  { x: 3, y: 0, z: 4 },
  { x: 4, y: 0, z: 4 },
];

const villageHomes = [
  { x: -3, y: 1, z: 2 },
  { x: 1, y: 1, z: -3 },
  { x: 4, y: 1, z: -1 },
  { x: 4, y: 1, z: 2 },
];

const treeLine = [
  { x: -5, y: 1, z: -4 },
  { x: -5, y: 1, z: 4 },
  { x: -2, y: 1, z: 4 },
  { x: 0, y: 1, z: -4 },
  { x: 2, y: 1, z: -4 },
  { x: 5, y: 1, z: -3 },
  { x: 5, y: 1, z: 4 },
];

function hasAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function paintTerrain(
  world: HiveWorldData,
  positions: HiveVector3[],
  type: string
) {
  return positions.reduce(
    (nextWorld, position) => upsertBlock(nextWorld, position, type),
    world
  );
}

function placeObjects(
  world: HiveWorldData,
  positions: HiveVector3[],
  type: string
) {
  return positions.reduce(
    (nextWorld, position) => addObject(nextWorld, position, type),
    world
  );
}

export function applyHiveAgentInstruction(
  world: HiveWorldData,
  prompt: string,
  options: HiveAgentInstructionOptions = {}
): HiveAgentWorldResult {
  const text = prompt.trim().toLowerCase();
  if (!text) {
    return {
      actions: [],
      changed: false,
      summary: 'Describe a world change first.',
      world,
    };
  }

  const destructiveAction = getHiveAgentDestructiveWorldAction(prompt);

  if (destructiveAction && !options.allowDestructiveWorldActions) {
    return {
      actions: [],
      changed: false,
      summary: 'Ask a Hive admin to clear or reseed the world.',
      world,
    };
  }

  if (destructiveAction === 'clear') {
    return {
      actions: ['cleared the canvas'],
      changed: true,
      summary: 'Hive agent cleared the world canvas.',
      world: createEmptyWorld(),
    };
  }

  if (destructiveAction === 'reseed') {
    return {
      actions: ['reseeded the default world'],
      changed: true,
      summary: 'Hive agent restored the default settlement seed.',
      world: createDefaultWorld(),
    };
  }

  let nextWorld = world;
  const actions: string[] = [];
  const wantsVillage = hasAny(text, ['town', 'village', 'settlement', 'house']);
  const wantsFarm = hasAny(text, ['farm', 'garden', 'crop', 'soil']);
  const wantsRiver = hasAny(text, ['river', 'water', 'canal', 'lake']);
  const wantsPath = hasAny(text, ['path', 'road', 'street', 'walkway']);
  const wantsTrees = hasAny(text, ['tree', 'forest', 'park', 'green']);
  const wantsLights = hasAny(text, ['light', 'lamp', 'night']);
  const wantsRocks = hasAny(text, ['rock', 'stone', 'mountain']);
  const wantsBridge = hasAny(text, ['bridge', 'crossing']);

  if (wantsRiver) {
    nextWorld = paintTerrain(nextWorld, riverPath, 'water');
    nextWorld = placeObjects(
      nextWorld,
      [
        { x: -2, y: 1, z: -1 },
        { x: 2, y: 1, z: 0 },
      ],
      'bridge'
    );
    actions.push('carved a river with bridge crossings');
  }

  if (wantsPath || wantsVillage || actions.length === 0) {
    nextWorld = paintTerrain(nextWorld, roadPath, 'path');
    actions.push('connected the world with paths');
  }

  if (wantsFarm || wantsVillage) {
    nextWorld = paintTerrain(nextWorld, farmTiles, 'garden');
    nextWorld = placeObjects(
      nextWorld,
      farmTiles
        .filter((_, index) => index % 2 === 0)
        .map((tile) => ({
          ...tile,
          y: 1,
        })),
      'crop'
    );
    actions.push('planted paired farm plots');
  }

  if (wantsVillage) {
    nextWorld = placeObjects(nextWorld, villageHomes, 'house');
    actions.push('placed a small village cluster');
  }

  if (wantsTrees || wantsVillage || actions.length === 0) {
    nextWorld = placeObjects(nextWorld, treeLine, 'tree');
    actions.push('softened the edges with trees');
  }

  if (wantsLights) {
    nextWorld = placeObjects(
      nextWorld,
      [
        { x: -1, y: 1, z: -2 },
        { x: -1, y: 1, z: 2 },
        { x: 2, y: 1, z: 1 },
      ],
      'lamp'
    );
    actions.push('added waypoint lamps');
  }

  if (wantsRocks) {
    nextWorld = paintTerrain(
      nextWorld,
      [
        { x: 1, y: 0, z: 3 },
        { x: 2, y: 0, z: -3 },
      ],
      'stone'
    );
    nextWorld = placeObjects(
      nextWorld,
      [
        { x: 1, y: 1, z: 3 },
        { x: 2, y: 1, z: -3 },
      ],
      'rock'
    );
    actions.push('added stone landmarks');
  }

  if (wantsBridge && !wantsRiver) {
    nextWorld = paintTerrain(
      nextWorld,
      [
        { x: 0, y: 0, z: -1 },
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
      ],
      'water'
    );
    nextWorld = placeObjects(nextWorld, [{ x: 0, y: 1, z: 0 }], 'bridge');
    actions.push('made a bridgeable water crossing');
  }

  return {
    actions,
    changed: actions.length > 0,
    summary: `Hive agent ${actions.join(', ')}.`,
    world: nextWorld,
  };
}
