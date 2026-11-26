'use client';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { getUserWorkspaceConfigQueryKey } from '@tuturuuu/ui/hooks/use-user-workspace-config';
import { useLayoutEffect, useMemo, useState } from 'react';
import {
  BOARD_USER_CONFIG_DEFAULTS,
  BOARD_WORKSPACE_CONFIG_IDS,
  type BoardPreferenceSeed,
} from './board-preference-seed';
import {
  type BoardFirstListPage,
  seedFromFirstListPages,
} from './use-progressive-board-loader';

/** A server snapshot this old at mount is revalidated in the background. */
export const STALE_BOARD_SNAPSHOT_MS = 5_000;

type SeedEntry = { key: readonly unknown[]; data: unknown };

/**
 * Whether a server copy read at `snapshotAt` may replace the cached query:
 * the cache is empty or was last written no later than that read. A
 * preloaded or back-navigated page model can be older than edits made in
 * this tab since, and never replaces them.
 */
export function canApplyServerCopy(
  queryClient: QueryClient,
  key: readonly unknown[],
  snapshotAt: number
) {
  const state = queryClient.getQueryState(key);
  return state?.data === undefined || state.dataUpdatedAt <= snapshotAt;
}

function preferenceSeedEntries(
  workspaceId: string,
  seed: BoardPreferenceSeed
): SeedEntry[] {
  const entries: SeedEntry[] = [];
  for (const [configId, fallback] of Object.entries(
    BOARD_USER_CONFIG_DEFAULTS
  )) {
    if (!Object.hasOwn(seed.userConfigs, configId)) continue;
    entries.push({
      key: ['user-config', configId],
      data: seed.userConfigs[configId] ?? fallback,
    });
  }
  for (const configId of BOARD_WORKSPACE_CONFIG_IDS) {
    if (!Object.hasOwn(seed.workspaceConfigs, configId)) continue;
    entries.push({
      key: getUserWorkspaceConfigQueryKey(workspaceId, configId),
      data: seed.workspaceConfigs[configId] ?? null,
    });
  }
  return entries;
}

/** Server first pages over the cache; lists the server did not read keep theirs. */
function mergeFirstPages(
  current: Task[] | undefined,
  seeded: Task[],
  listIds: ReadonlySet<string>
) {
  const seededIds = new Set(seeded.map((task) => task.id));
  const kept = (current ?? []).filter(
    (task) =>
      !seededIds.has(task.id) &&
      !(task.list_id != null && listIds.has(task.list_id))
  );
  return [...kept, ...seeded];
}

/**
 * Seeds the board, its first task pages and the board preferences read during
 * the server render into the query cache, for one mounted board (callers key
 * the component by board). Rendering only creates queries absent from the
 * cache; replacing an older cached copy happens in layout effects, before
 * paint. Task pages seed once per mount; the board and preferences follow the
 * current props, each under the time its own read started.
 */
export function useBoardServerSeed({
  boardId,
  boardQueryKey,
  seedBoardQuery,
  initialBoard,
  initialListPages,
  initialPreferences,
  snapshotAt,
}: {
  boardId: string;
  boardQueryKey: readonly unknown[];
  /** Whether `initialBoard` belongs in `boardQueryKey` (same workspace). */
  seedBoardQuery: boolean;
  initialBoard?: WorkspaceTaskBoard;
  initialListPages?: Record<string, BoardFirstListPage>;
  initialPreferences?: BoardPreferenceSeed;
  snapshotAt: number;
}) {
  const queryClient = useQueryClient();
  const boardMatches = initialBoard?.id === boardId;
  const preferenceEntries = useMemo(
    () =>
      boardMatches && initialPreferences
        ? preferenceSeedEntries(initialBoard.ws_id, initialPreferences)
        : [],
    [boardMatches, initialBoard?.ws_id, initialPreferences]
  );

  const [taskSeed] = useState(() => {
    for (const { key, data } of preferenceEntries) {
      if (queryClient.getQueryState(key) !== undefined) continue;
      queryClient.setQueryData(key, data, { updatedAt: snapshotAt });
    }
    if (!boardMatches || !initialListPages) return null;
    const write = canApplyServerCopy(
      queryClient,
      ['tasks', boardId],
      snapshotAt
    );
    return {
      ...seedFromFirstListPages(initialListPages),
      listIds: new Set(Object.keys(initialListPages)),
      snapshotAt,
      write,
      // A cached newer copy may be partial, and an old snapshot (a reused
      // preloaded or cached route) may predate changes this tab never saw.
      revalidate: !write || Date.now() - snapshotAt > STALE_BOARD_SNAPSHOT_MS,
    };
  });

  useLayoutEffect(() => {
    for (const { key, data } of preferenceEntries) {
      if (canApplyServerCopy(queryClient, key, snapshotAt))
        queryClient.setQueryData(key, data, { updatedAt: snapshotAt });
    }
  }, [preferenceEntries, queryClient, snapshotAt]);

  useLayoutEffect(() => {
    if (!boardMatches || !seedBoardQuery || !initialBoard) return;
    if (canApplyServerCopy(queryClient, boardQueryKey, snapshotAt))
      queryClient.setQueryData(boardQueryKey, initialBoard, {
        updatedAt: snapshotAt,
      });
  }, [
    boardMatches,
    boardQueryKey,
    initialBoard,
    queryClient,
    seedBoardQuery,
    snapshotAt,
  ]);

  useLayoutEffect(() => {
    if (!taskSeed?.write) return;
    const key = ['tasks', boardId];
    if (!canApplyServerCopy(queryClient, key, taskSeed.snapshotAt)) return;
    queryClient.setQueryData(
      key,
      (current: Task[] | undefined) =>
        mergeFirstPages(current, taskSeed.tasks, taskSeed.listIds),
      { updatedAt: taskSeed.snapshotAt }
    );
  }, [boardId, queryClient, taskSeed]);

  return {
    /** Server pages were supplied, so the older browser copy is not used. */
    hasServerPages: taskSeed !== null,
    pagination: taskSeed?.pagination,
    initialTasks: taskSeed?.write ? taskSeed.tasks : undefined,
    initialTasksUpdatedAt: taskSeed?.write ? taskSeed.snapshotAt : undefined,
    revalidateOnMount: taskSeed?.revalidate ?? false,
  };
}
