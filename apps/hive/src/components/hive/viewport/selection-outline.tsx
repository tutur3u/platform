'use client';

import { Line } from '@react-three/drei';
import { getTerrainHeight } from '@/engine/catalog';
import { getObjectFootprintCells } from '@/engine/footprint';
import type {
  HiveBlock,
  HiveNpc,
  HiveSelection,
  HiveWorldData,
} from '@/engine/types';

type SelectionOutlineProps = {
  gaplessMode: boolean;
  npcs: HiveNpc[];
  selection: HiveSelection;
  world: HiveWorldData;
};

type SelectionLinePoint = [number, number, number];

const TILE_SIZE = 0.985;
const OUTLINE_PAD = 0.02;
const OUTLINE_OFFSET = 0.045;
const SELECTED_COLOR = '#fef08a';
const SELECTED_HALO = '#2b2110';

export function SelectionOutline({
  gaplessMode,
  npcs,
  selection,
  world,
}: SelectionOutlineProps) {
  const points = getSelectionOutlinePoints({
    gaplessMode,
    npcs,
    selection,
    world,
  });

  if (!selection || points.length === 0) {
    return null;
  }

  return (
    <>
      <Line
        color={SELECTED_HALO}
        dashed
        dashSize={0.18}
        depthTest={false}
        gapSize={0.11}
        lineWidth={7}
        opacity={0.54}
        points={points}
        renderOrder={39}
        segments
        transparent
      />
      <Line
        color={SELECTED_COLOR}
        dashed
        dashSize={0.18}
        depthTest={false}
        gapSize={0.11}
        lineWidth={4.4}
        opacity={0.98}
        points={points}
        renderOrder={40}
        segments
        transparent
      />
    </>
  );
}

function getSelectionOutlinePoints({
  gaplessMode,
  npcs,
  selection,
  world,
}: SelectionOutlineProps): SelectionLinePoint[] {
  if (!selection) {
    return [];
  }

  const halfSize = getOutlineHalfSize(gaplessMode);

  if (selection.kind === 'block') {
    const block = world.blocks.find((item) => item.id === selection.id);
    if (!block) return [];

    return createRectPoints({
      maxX: block.position.x + halfSize,
      maxZ: block.position.z + halfSize,
      minX: block.position.x - halfSize,
      minZ: block.position.z - halfSize,
      y: block.position.y + getTerrainHeight(block.type) + OUTLINE_OFFSET,
    });
  }

  if (selection.kind === 'object') {
    const object = world.objects.find((item) => item.id === selection.id);
    if (!object) return [];

    const cells = getObjectFootprintCells(object);
    const baseY = getFootprintSurfaceY(world.blocks, cells) + OUTLINE_OFFSET;
    const topY = Math.max(
      baseY + 0.34,
      object.position.y - 1 + getObjectOutlineHeight(object.type)
    );
    const xs = cells.map((cell) => cell.x);
    const zs = cells.map((cell) => cell.z);

    return createBoxPoints({
      baseY,
      maxX: Math.max(...xs) + halfSize,
      maxZ: Math.max(...zs) + halfSize,
      minX: Math.min(...xs) - halfSize,
      minZ: Math.min(...zs) - halfSize,
      topY,
    });
  }

  const npc = npcs.find((item) => item.id === selection.id);
  if (!npc) return [];

  return createBoxPoints({
    baseY: npc.position.y - 0.92,
    maxX: npc.position.x + 0.38,
    maxZ: npc.position.z + 0.38,
    minX: npc.position.x - 0.38,
    minZ: npc.position.z - 0.38,
    topY: npc.position.y + 0.26,
  });
}

function getOutlineHalfSize(gaplessMode: boolean) {
  return (gaplessMode ? 1 : TILE_SIZE) / 2 + OUTLINE_PAD;
}

function createRectPoints({
  maxX,
  maxZ,
  minX,
  minZ,
  y,
}: {
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
  y: number;
}): SelectionLinePoint[] {
  return [
    [minX, y, minZ],
    [maxX, y, minZ],
    [maxX, y, minZ],
    [maxX, y, maxZ],
    [maxX, y, maxZ],
    [minX, y, maxZ],
    [minX, y, maxZ],
    [minX, y, minZ],
  ];
}

function createBoxPoints({
  baseY,
  maxX,
  maxZ,
  minX,
  minZ,
  topY,
}: {
  baseY: number;
  maxX: number;
  maxZ: number;
  minX: number;
  minZ: number;
  topY: number;
}): SelectionLinePoint[] {
  return [
    ...createRectPoints({ maxX, maxZ, minX, minZ, y: baseY }),
    ...createRectPoints({ maxX, maxZ, minX, minZ, y: topY }),
    [minX, baseY, minZ],
    [minX, topY, minZ],
    [maxX, baseY, minZ],
    [maxX, topY, minZ],
    [maxX, baseY, maxZ],
    [maxX, topY, maxZ],
    [minX, baseY, maxZ],
    [minX, topY, maxZ],
  ];
}

function getFootprintSurfaceY(
  blocks: HiveBlock[],
  cells: Array<{ x: number; z: number }>
) {
  return cells.reduce((height, cell) => {
    const block = blocks.find(
      (item) => item.position.x === cell.x && item.position.z === cell.z
    );
    return Math.max(height, block ? getTerrainHeight(block.type) : 0.18);
  }, 0);
}

function getObjectOutlineHeight(type: string) {
  if (type === 'townhouse') return 1.74;
  if (type === 'watchtower') return 1.92;
  if (type === 'tree') return 1.94;
  if (type === 'civic-hall') return 1.64;
  if (type === 'house' || type === 'cottage') return 1.42;
  if (type === 'lamp' || type === 'marker') return 1.18;
  if (type === 'well' || type === 'npc-spawn') return 1.16;
  if (type === 'bridge') return 0.56;
  if (type === 'crop' || type === 'flower-crop') return 0.42;
  if (type === 'sensor') return 0.96;
  return 0.76;
}
