'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import { useEffect } from 'react';
import {
  useBulkClearAssignees,
  useBulkClearLabels,
  useBulkClearProjects,
  useBulkDeleteTasks,
} from './bulk-mutations-clear-delete';
import {
  useBulkMoveToBoard,
  useBulkMoveToList,
  useBulkMoveToStatus,
} from './bulk-mutations-move';
import {
  useBulkAddAssignee,
  useBulkAddLabel,
  useBulkAddProject,
  useBulkRemoveAssignee,
  useBulkRemoveLabel,
  useBulkRemoveProject,
} from './bulk-mutations-relations';
import {
  useBulkUpdateCustomDueDate,
  useBulkUpdateDueDate,
  useBulkUpdateEstimation,
  useBulkUpdatePriority,
} from './bulk-mutations-updates';
import { useBulkOperationI18n } from './bulk-operation-i18n';
import type { BulkOperationsConfig } from './bulk-operation-types';

export function useBulkOperations(config: BulkOperationsConfig) {
  const i18n = useBulkOperationI18n();

  const {
    queryClient,
    wsId,
    boardId,
    selectedTasks,
    columns,
    workspaceLabels = [],
    workspaceProjects = [],
    workspaceMembers = [],
    weekStartsOn = 0,
    setBulkWorking,
    clearSelection,
    setBulkDeleteOpen,
    broadcast,
  } = config;

  const priorityMutation = useBulkUpdatePriority(
    queryClient,
    wsId,
    boardId,
    broadcast,
    i18n
  );
  const estimationMutation = useBulkUpdateEstimation(
    queryClient,
    wsId,
    boardId,
    broadcast,
    i18n
  );
  const dueDateMutation = useBulkUpdateDueDate(
    queryClient,
    wsId,
    boardId,
    weekStartsOn,
    broadcast,
    i18n
  );
  const customDueDateMutation = useBulkUpdateCustomDueDate(
    queryClient,
    wsId,
    boardId,
    broadcast,
    i18n
  );
  const moveToListMutation = useBulkMoveToList(
    queryClient,
    wsId,
    boardId,
    broadcast,
    i18n
  );
  const statusMutation = useBulkMoveToStatus(
    queryClient,
    wsId,
    boardId,
    columns,
    broadcast,
    i18n
  );
  const addLabelMutation = useBulkAddLabel(
    queryClient,
    wsId,
    boardId,
    workspaceLabels,
    broadcast,
    i18n
  );
  const removeLabelMutation = useBulkRemoveLabel(
    queryClient,
    wsId,
    boardId,
    workspaceLabels,
    broadcast,
    i18n
  );
  const addProjectMutation = useBulkAddProject(
    queryClient,
    wsId,
    boardId,
    workspaceProjects,
    broadcast,
    i18n
  );
  const removeProjectMutation = useBulkRemoveProject(
    queryClient,
    wsId,
    boardId,
    workspaceProjects,
    broadcast,
    i18n
  );
  const addAssigneeMutation = useBulkAddAssignee(
    queryClient,
    wsId,
    boardId,
    workspaceMembers,
    broadcast,
    i18n
  );
  const removeAssigneeMutation = useBulkRemoveAssignee(
    queryClient,
    wsId,
    boardId,
    broadcast,
    i18n
  );
  const clearLabelsMutation = useBulkClearLabels(
    queryClient,
    wsId,
    boardId,
    broadcast,
    i18n
  );
  const clearProjectsMutation = useBulkClearProjects(
    queryClient,
    wsId,
    boardId,
    broadcast,
    i18n
  );
  const clearAssigneesMutation = useBulkClearAssignees(
    queryClient,
    wsId,
    boardId,
    broadcast,
    i18n
  );
  const deleteMutation = useBulkDeleteTasks(
    queryClient,
    wsId,
    boardId,
    clearSelection,
    setBulkDeleteOpen,
    broadcast,
    i18n
  );
  const moveToBoardMutation = useBulkMoveToBoard(
    queryClient,
    wsId,
    boardId,
    broadcast,
    i18n
  );

  const isAnyMutationPending =
    priorityMutation.isPending ||
    estimationMutation.isPending ||
    dueDateMutation.isPending ||
    customDueDateMutation.isPending ||
    moveToListMutation.isPending ||
    statusMutation.isPending ||
    addLabelMutation.isPending ||
    removeLabelMutation.isPending ||
    addProjectMutation.isPending ||
    removeProjectMutation.isPending ||
    addAssigneeMutation.isPending ||
    removeAssigneeMutation.isPending ||
    clearLabelsMutation.isPending ||
    clearProjectsMutation.isPending ||
    clearAssigneesMutation.isPending ||
    deleteMutation.isPending ||
    moveToBoardMutation.isPending;

  useEffect(() => {
    setBulkWorking(isAnyMutationPending);
  }, [isAnyMutationPending, setBulkWorking]);

  function getListIdByStatus(status: 'done' | 'closed'): string | null {
    const list = columns.find((c) => c.status === status);
    return list ? String(list.id) : null;
  }

  return {
    bulkUpdatePriority: async (priority: Task['priority'] | null) => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      await priorityMutation.mutateAsync({ priority, taskIds });
    },
    bulkUpdateEstimation: async (points: number | null) => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      await estimationMutation.mutateAsync({ points, taskIds });
    },
    bulkUpdateDueDate: async (
      preset: 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'clear'
    ) => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      await dueDateMutation.mutateAsync({ preset, taskIds });
    },
    bulkUpdateCustomDueDate: async (date: Date | null) => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      await customDueDateMutation.mutateAsync({ date, taskIds });
    },
    bulkMoveToList: async (listId: string, listName: string) => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      await moveToListMutation.mutateAsync({ listId, listName, taskIds });
    },
    bulkMoveToStatus: async (status: 'done' | 'closed') => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      const listId = getListIdByStatus(status);
      if (!listId) return;
      await statusMutation.mutateAsync({ status, taskIds });
    },
    bulkAddLabel: async (labelId: string) => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      await addLabelMutation.mutateAsync({ labelId, taskIds });
    },
    bulkRemoveLabel: async (labelId: string) => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      await removeLabelMutation.mutateAsync({ labelId, taskIds });
    },
    bulkAddProject: async (projectId: string) => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      await addProjectMutation.mutateAsync({ projectId, taskIds });
    },
    bulkRemoveProject: async (projectId: string) => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      await removeProjectMutation.mutateAsync({ projectId, taskIds });
    },
    bulkAddAssignee: async (assigneeId: string) => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      await addAssigneeMutation.mutateAsync({ assigneeId, taskIds });
    },
    bulkRemoveAssignee: async (assigneeId: string) => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      await removeAssigneeMutation.mutateAsync({ assigneeId, taskIds });
    },
    bulkClearLabels: async () => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      await clearLabelsMutation.mutateAsync({ taskIds });
    },
    bulkClearProjects: async () => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      await clearProjectsMutation.mutateAsync({ taskIds });
    },
    bulkClearAssignees: async () => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      await clearAssigneesMutation.mutateAsync({ taskIds });
    },
    bulkDeleteTasks: async () => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      await deleteMutation.mutateAsync({ taskIds });
    },
    bulkMoveToBoard: async (targetBoardId: string, targetListId: string) => {
      const taskIds = Array.from(selectedTasks);
      if (!taskIds.length) return;
      await moveToBoardMutation.mutateAsync({
        targetBoardId,
        targetListId,
        taskIds,
      });
    },
    getListIdByStatus,
  };
}

export function createBulkOperations(_config: BulkOperationsConfig): never {
  throw new Error(
    'createBulkOperations is deprecated. Use useBulkOperations hook instead.'
  );
}
