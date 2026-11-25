import type { ComponentType } from 'react';
import {
  MERGED_ACTIVITY_IDS,
  MERGED_TILE_ID,
  type MergedActivityKind,
  mergedKindOf,
  PEN_FIRST_WHITEBOARD_IDS,
} from '../stage-layout/merged-activities';
import type { ActivityTile } from './activities-pages';

export type MergedTileCopy = Readonly<
  Record<
    MergedActivityKind,
    {
      label: string;
      description: string;
      icon: ComponentType<{ className?: string }>;
    }
  >
>;

const sourceId = (tile: ActivityTile) => tile.stageId ?? tile.id;

/**
 * Meet UX v2's catalog: one Whiteboard and one Timer entry. Each takes the
 * best older entry this person has (see `MERGED_ACTIVITY_IDS`), with its
 * launch action, stage id or page, under the merged name. It sits where the
 * first of its older entries was; the other older entries leave the list.
 * `penBoardFirst` puts the pen board ahead of the Tuturuuu Whiteboard (see
 * `whiteboardPolicy`).
 */
export function mergeActivityTiles(
  tiles: readonly ActivityTile[],
  copy: MergedTileCopy,
  { penBoardFirst = false }: { penBoardFirst?: boolean } = {}
): ActivityTile[] {
  const order = (kind: MergedActivityKind) =>
    kind === 'whiteboard' && penBoardFirst
      ? PEN_FIRST_WHITEBOARD_IDS
      : MERGED_ACTIVITY_IDS[kind];
  const chosen = new Map<MergedActivityKind, ActivityTile>();
  for (const kind of Object.keys(MERGED_ACTIVITY_IDS) as MergedActivityKind[])
    for (const id of order(kind)) {
      const tile = tiles.find((entry) => sourceId(entry) === id);
      if (!tile) continue;
      chosen.set(kind, tile);
      break;
    }
  const placed = new Set<MergedActivityKind>();
  return tiles.flatMap((tile) => {
    const kind = mergedKindOf(sourceId(tile));
    if (!kind) return [tile];
    const best = chosen.get(kind);
    if (!best || placed.has(kind)) return [];
    placed.add(kind);
    return [{ ...best, id: MERGED_TILE_ID[kind], ...copy[kind] }];
  });
}
