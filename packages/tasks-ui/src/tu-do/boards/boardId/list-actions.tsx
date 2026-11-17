import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateWorkspaceTaskList } from '@tuturuuu/internal-api/tasks';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useBoardBroadcast } from '../../shared/board-broadcast-context';
import { ListSettingsDialog } from '../../shared/list-settings-dialog';
import { isTaskListNameExistsError } from '../../shared/task-board-errors';
import { BoardSelector } from '../board-selector';
import { ArchiveTasksDialog, DeleteListDialog } from './list-action-dialogs';
import { ListActionsMenu } from './list-actions-menu';
import { useListBulkMove } from './use-list-bulk-move';

interface Props {
  listId: string;
  listName: string;
  listStatus?: TaskBoardStatus;
  listColor?: SupportedColor;
  lists?: TaskList[];
  tasks?: Task[];
  boardId?: string;
  wsId?: string;
  onUpdate: () => void;
  onSelectAll?: () => void;
  isEditOpen: boolean;
  onEditOpenChange: (open: boolean) => void;
}

export function ListActions({
  listId,
  listName,
  listStatus,
  listColor,
  lists = [],
  tasks = [],
  boardId = '',
  wsId,
  onUpdate,
  onSelectAll,
  isEditOpen,
  onEditOpenChange,
}: Props) {
  const t = useTranslations('common');
  const taskBoardT = useTranslations();
  const canManageList = Boolean(wsId && boardId);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isMoveAllDialogOpen, setIsMoveAllDialogOpen] = useState(false);

  const queryClient = useQueryClient();
  const broadcast = useBoardBroadcast();

  const allowedStatuses = useMemo<TaskBoardStatus[]>(() => {
    return ['documents', 'not_started', 'active', 'review', 'done', 'closed'];
  }, []);
  const capacityLists = useMemo<TaskList[]>(
    () =>
      lists.length > 0
        ? lists
        : [
            {
              archived: false,
              board_id: boardId,
              color: listColor ?? 'GRAY',
              created_at: '',
              creator_id: '',
              deleted: false,
              id: listId,
              name: listName,
              position: 0,
              status: listStatus ?? 'not_started',
            },
          ],
    [boardId, listColor, listId, listName, listStatus, lists]
  );

  const listBulkMove = useListBulkMove({
    wsId,
    broadcast,
    onSettled: onUpdate,
  });

  const deleteListMutation = useMutation({
    mutationFn: async () => {
      if (!wsId || !boardId) {
        throw new Error(t('save_failed'));
      }

      return updateWorkspaceTaskList(
        wsId,
        boardId,
        listId,
        { deleted: true },
        {
          baseUrl:
            typeof window !== 'undefined' ? window.location.origin : undefined,
        }
      );
    },
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['task_lists', boardId] }),
        queryClient.cancelQueries({ queryKey: ['tasks', boardId] }),
      ]);

      const previousLists = queryClient.getQueryData<TaskList[]>([
        'task_lists',
        boardId,
      ]);
      const previousTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        boardId,
      ]);

      queryClient.setQueryData(
        ['task_lists', boardId],
        (old: TaskList[] | undefined) => {
          if (!old) return old;
          return old.filter((list) => list.id !== listId);
        }
      );
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.filter((task) => task.list_id !== listId);
        }
      );

      return { previousLists, previousTasks };
    },
    onSuccess: () => {
      broadcast?.('list:delete', { listId });
      onUpdate();
    },
    onError: (error, _, context) => {
      if (context?.previousLists) {
        queryClient.setQueryData(
          ['task_lists', boardId],
          context.previousLists
        );
      }
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      toast.error(error instanceof Error ? error.message : t('save_failed'));
    },
  });

  const editListMutation = useMutation({
    mutationFn: async ({
      trimmedName,
      status,
      color,
    }: {
      trimmedName: string;
      status: TaskBoardStatus;
      color: SupportedColor;
    }) => {
      if (!wsId || !boardId) {
        throw new Error(t('save_failed'));
      }

      return updateWorkspaceTaskList(
        wsId,
        boardId,
        listId,
        { name: trimmedName, status, color },
        {
          baseUrl:
            typeof window !== 'undefined' ? window.location.origin : undefined,
        }
      );
    },
    onMutate: async ({ trimmedName, status, color }) => {
      await queryClient.cancelQueries({ queryKey: ['task_lists', boardId] });
      const previousLists = queryClient.getQueryData<TaskList[]>([
        'task_lists',
        boardId,
      ]);

      queryClient.setQueryData(
        ['task_lists', boardId],
        (old: TaskList[] | undefined) => {
          if (!old) return old;
          return old.map((l) =>
            l.id === listId ? { ...l, name: trimmedName, status, color } : l
          );
        }
      );

      return { previousLists };
    },
    onSuccess: (_, { trimmedName, status, color }) => {
      broadcast?.('list:upsert', {
        list: { id: listId, name: trimmedName, status, color },
      });
      toast.success(t('name_updated'));
      onEditOpenChange(false);
      onUpdate();
    },
    onError: (error, _, context) => {
      if (context?.previousLists) {
        queryClient.setQueryData(
          ['task_lists', boardId],
          context.previousLists
        );
      }
      toast.error(
        isTaskListNameExistsError(error)
          ? taskBoardT('ws-task-boards.layout_settings.list_name_exists')
          : error instanceof Error
            ? error.message
            : t('save_failed')
      );
    },
  });

  function handleDelete() {
    setIsDeleteDialogOpen(false);
    deleteListMutation.mutate();
  }

  function handleArchiveAllTasks() {
    setIsArchiveDialogOpen(false);
    if (!wsId || !boardId || tasks.length === 0) return;

    const closedList = (
      queryClient.getQueryData<TaskList[]>(['task_lists', boardId]) ?? lists
    ).find((list) => list.status === 'closed' && !list.deleted);

    listBulkMove.mutate({
      kind: 'archive',
      toastId: `list-archive-${listId}-${Date.now()}`,
      total: tasks.length,
      fromBoardId: boardId,
      sourceListId: listId,
      toBoardId: boardId,
      toListId: closedList?.id,
    });
  }

  // Handler for bulk moving all tasks from this list
  function handleMoveAllTasks() {
    if (tasks.length === 0) {
      toast.info(t('this_list_is_empty'));
      return;
    }
    setIsMoveAllDialogOpen(true);
  }

  function handleBulkMove(targetBoardId: string, targetListId: string) {
    setIsMoveAllDialogOpen(false);
    if (tasks.length === 0) return;

    listBulkMove.mutate({
      kind: 'move',
      toastId: `list-move-${listId}-${Date.now()}`,
      total: tasks.length,
      fromBoardId: boardId,
      sourceListId: listId,
      toBoardId: targetBoardId || boardId,
      toListId: targetListId,
    });
  }

  return (
    <>
      <ListActionsMenu
        taskCount={tasks.length}
        onOpenSettings={
          canManageList ? () => onEditOpenChange(true) : undefined
        }
        onSelectAll={tasks.length > 0 ? onSelectAll : undefined}
        onMoveAll={
          canManageList && tasks.length > 0 ? handleMoveAllTasks : undefined
        }
        onArchiveAll={
          canManageList && listStatus === 'done' && tasks.length > 0
            ? () => setIsArchiveDialogOpen(true)
            : undefined
        }
        onDelete={canManageList ? () => setIsDeleteDialogOpen(true) : undefined}
      />

      <DeleteListDialog
        count={tasks.length}
        listName={listName}
        onConfirm={handleDelete}
        onMoveFirst={
          tasks.length > 0
            ? () => {
                setIsDeleteDialogOpen(false);
                setIsMoveAllDialogOpen(true);
              }
            : undefined
        }
        onOpenChange={setIsDeleteDialogOpen}
        open={canManageList && isDeleteDialogOpen}
      />

      <ListSettingsDialog
        allowedStatuses={allowedStatuses}
        boardId={boardId}
        isSaving={editListMutation.isPending}
        list={{
          id: listId,
          name: listName,
          status: listStatus,
          color: listColor ?? 'GRAY',
        }}
        lists={capacityLists}
        onOpenChange={onEditOpenChange}
        onSave={({ updates }) => {
          if (!allowedStatuses.includes(updates.status)) {
            toast.error(t('save_failed'));
            return;
          }
          editListMutation.mutate({
            trimmedName: updates.name,
            status: updates.status,
            color: updates.color,
          });
        }}
        open={canManageList && isEditOpen}
        wsId={wsId}
      />

      <ArchiveTasksDialog
        closedListName={
          (
            queryClient.getQueryData<TaskList[]>(['task_lists', boardId]) ??
            lists
          ).find((list) => list.status === 'closed' && !list.deleted)?.name
        }
        count={tasks.length}
        listName={listName}
        onConfirm={handleArchiveAllTasks}
        onOpenChange={setIsArchiveDialogOpen}
        open={canManageList && isArchiveDialogOpen}
      />

      {/* Board Selector for Moving All Tasks */}
      {canManageList && wsId && (
        <BoardSelector
          open={isMoveAllDialogOpen}
          onOpenChange={setIsMoveAllDialogOpen}
          wsId={wsId}
          currentBoardId={boardId}
          currentListId={listId}
          taskCount={tasks.length}
          onMove={handleBulkMove}
        />
      )}
    </>
  );
}
