import {
  MAX_HIVE_OBJECT_FOOTPRINT_CELLS,
  normalizeHiveObjectFootprint,
} from '@tuturuuu/realtime/hive';
import { getObjectCatalogItem } from './catalog';
import type { HiveObject, HiveVector3 } from './types';

export type HiveObjectFootprint = {
  autoExpandTerrain?: boolean;
  depth: number;
  width: number;
};

type FootprintInput = Partial<HiveObjectFootprint> | null | undefined;

const DEFAULT_FOOTPRINT = {
  depth: 1,
  width: 1,
} satisfies HiveObjectFootprint;

export function normalizeObjectFootprint(
  footprint: FootprintInput
): HiveObjectFootprint {
  return normalizeHiveObjectFootprint(footprint) ?? DEFAULT_FOOTPRINT;
}

export function getObjectFootprint(
  type: string,
  state?: HiveObject['state']
): HiveObjectFootprint {
  return normalizeObjectFootprint(
    getStateFootprint(state) ?? getObjectCatalogItem(type)?.footprint
  );
}

export function getRotatedObjectFootprint(
  footprint: HiveObjectFootprint,
  rotation = 0
): HiveObjectFootprint {
  const quarterTurns = Math.round(rotation / 90);
  const shouldSwap = Math.abs(quarterTurns) % 2 === 1;

  return shouldSwap
    ? { ...footprint, depth: footprint.width, width: footprint.depth }
    : footprint;
}

export function getObjectFootprintCells({
  position,
  rotation,
  state,
  type,
}: {
  position: HiveVector3;
  rotation?: number;
  state?: HiveObject['state'];
  type: string;
}) {
  const footprint = getRotatedObjectFootprint(
    getObjectFootprint(type, state),
    rotation
  );
  const cells: HiveVector3[] = [];

  for (let x = 0; x < footprint.width; x += 1) {
    for (let z = 0; z < footprint.depth; z += 1) {
      if (cells.length >= MAX_HIVE_OBJECT_FOOTPRINT_CELLS) {
        return cells;
      }

      cells.push({
        x: position.x + x,
        y: 0,
        z: position.z + z,
      });
    }
  }

  return cells;
}

export function getObjectFootprintCenter({
  position,
  rotation,
  state,
  type,
}: {
  position: HiveVector3;
  rotation?: number;
  state?: HiveObject['state'];
  type: string;
}) {
  const footprint = getRotatedObjectFootprint(
    getObjectFootprint(type, state),
    rotation
  );

  return {
    x: position.x + (footprint.width - 1) / 2,
    y: position.y,
    z: position.z + (footprint.depth - 1) / 2,
  } satisfies HiveVector3;
}

export function getObjectFootprintLabel(type: string) {
  const footprint = getObjectFootprint(type);

  if (
    footprint.width === DEFAULT_FOOTPRINT.width &&
    footprint.depth === DEFAULT_FOOTPRINT.depth
  ) {
    return '1x1';
  }

  return `${footprint.width}x${footprint.depth}`;
}

export function objectFootprintsIntersect(
  first: HiveVector3[],
  second: HiveVector3[]
) {
  return first.some((firstCell) =>
    second.some(
      (secondCell) =>
        firstCell.x === secondCell.x && firstCell.z === secondCell.z
    )
  );
}

function getStateFootprint(state?: HiveObject['state']) {
  const value = state?.footprint;

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const footprint = value as Record<string, unknown>;
  return normalizeHiveObjectFootprint(footprint);
}
