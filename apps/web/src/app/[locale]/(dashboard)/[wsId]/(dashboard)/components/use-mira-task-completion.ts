'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  listWorkspaceTaskLists,
  updateWorkspaceTask,
  upsertCurrentUserTaskPersonalPlacement,
} from '@tuturuuu/internal-api/tasks';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import type { ArtifactRow } from './mira-artifact-data';

export function useMiraTaskCompletion() {
  const queryClient = useQueryClient();
  const t = useTranslations('dashboard.mira_workspace');
  const inFlight = useRef(new Set<string>());
  const [pendingIds, setPendingIds] = useState(new Set<string>());

  async function complete(row: ArtifactRow) {
    if (
      !row.taskWorkspaceId ||
      !row.taskBoardId ||
      inFlight.current.has(row.id)
    ) {
      return;
    }
    inFlight.current.add(row.id);
    setPendingIds(new Set(inFlight.current));
    try {
      if (row.personalBoardId) {
        await upsertCurrentUserTaskPersonalPlacement(row.id, {
          personal_board_id: row.personalBoardId,
          personal_list_id: row.personalListId ?? null,
          terminal_status: 'done',
        });
      } else {
        const { lists } = await listWorkspaceTaskLists(
          row.taskWorkspaceId,
          row.taskBoardId
        );
        const doneList = lists.find((list) => list.status === 'done');
        if (!doneList) {
          toast.error(t('task_done_list_missing'));
          return;
        }
        await updateWorkspaceTask(row.taskWorkspaceId, row.id, {
          list_id: doneList.id,
        });
      }
      const artifactQueries = {
        predicate: (query: { queryKey: readonly unknown[] }) =>
          query.queryKey[0] === 'mira-artifact' &&
          query.queryKey[2] === 'tasks',
      };
      // Cancel older reads before removing the confirmed completion from panels.
      await queryClient.cancelQueries(artifactQueries);
      queryClient.setQueriesData<ArtifactRow[]>(artifactQueries, (rows) =>
        rows?.filter((task) => task.id !== row.id)
      );
      toast.success(t('task_completed'));
      void queryClient.invalidateQueries(artifactQueries);
      void queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      void queryClient.invalidateQueries({
        queryKey: ['tasks', row.taskBoardId],
      });
    } catch {
      toast.error(t('complete_task_failed'));
    } finally {
      inFlight.current.delete(row.id);
      setPendingIds(new Set(inFlight.current));
    }
  }

  return { complete, pendingIds };
}
