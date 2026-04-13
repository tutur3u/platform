import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowRightLeft,
  CheckSquare,
  MoreHorizontal,
  Pencil,
  Trash,
} from '@tuturuuu/icons';
import {
  createWorkspaceTaskList,
  listWorkspaceTaskLists,
  updateWorkspaceTaskList,
} from '@tuturuuu/internal-api/tasks';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { useMoveAllTasksFromList } from '@tuturuuu/utils/task-helper';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useBoardBroadcast } from '../../shared/board-broadcast-context';
import { EditListDialog } from '../../shared/edit-list-dialog';
import { BoardSelector } from '../board-selector';

interface Props {
  listId: string;
  listName: string;
  listStatus?: TaskBoardStatus;
  listColor?: SupportedColor;
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
  tasks = [],
  boardId = '',
  wsId,
  onUpdate,
  onSelectAll,
  isEditOpen,
  onEditOpenChange,
}: Props) {
  const t = useTranslations('common');
  const canManageList = Boolean(wsId && boardId);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isMoveAllDialogOpen, setIsMoveAllDialogOpen] = useState(false);

  const queryClient = useQueryClient();
  const broadcast = useBoardBroadcast();

  const cachedLists = queryClient.getQueryData<TaskList[]>([
    'task_lists',
    boardId,
  ]);
  const hasAnotherClosedList =
    cachedLists?.some(
      (list) => list.id !== listId && list.status === 'closed' && !list.deleted
    ) ?? false;
  const allowedStatuses = useMemo<TaskBoardStatus[]>(() => {
    if (listStatus === 'closed' || !hasAnotherClosedList) {
      return ['documents', 'not_started', 'active', 'done', 'closed'];
    }

    return ['documents', 'not_started', 'active', 'done'];
  }, [hasAnotherClosedList, listStatus]);

  const moveAllTasksFromListMutation = useMoveAllTasksFromList(
    boardId,
    wsId,
    broadcast
  );

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
      setIsDeleteDialogOpen(false);
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
      toast.error(error instanceof Error ? error.message : t('save_failed'));
    },
  });

  const archiveAllTasksMutation = useMutation({
    mutationFn: async () => {
      if (!wsId || !boardId || tasks.length === 0) {
        return {
          success: true,
          movedCount: 0,
          movedTaskIds: [] as string[],
          failedTaskIds: [] as string[],
        };
      }

      const options = {
        baseUrl:
          typeof window !== 'undefined' ? window.location.origin : undefined,
      };

      const { lists } = await listWorkspaceTaskLists(wsId, boardId, options);
      const existingClosedList = lists.find(
        (list) => list.status === 'closed' && !list.deleted
      );

      const closedListId = existingClosedList
        ? existingClosedList.id
        : (
            await createWorkspaceTaskList(
              wsId,
              boardId,
              {
                name: t('archived'),
                status: 'closed',
                color: 'PURPLE',
              },
              options
            )
          ).list.id;

      return moveAllTasksFromListMutation.mutateAsync({
        sourceListId: listId,
        targetListId: closedListId,
      });
    },
    onSuccess: (result) => {
      if (result.movedCount > 0 && result.failedTaskIds.length > 0) {
        toast.warning(
          t('archived_tasks_partially', {
            moved: result.movedCount,
            failed: result.failedTaskIds.length,
          })
        );
      } else if (result.movedCount > 0) {
        toast.success(
          t('archived_tasks_successfully', {
            count: result.movedCount,
          })
        );
      }

      onUpdate();
      setIsArchiveDialogOpen(false);
    },
    onError: (error) => {
      console.error('Failed to archive tasks:', error);
      toast.error(t('failed_to_archive_tasks'));
    },
  });

  function handleDelete() {
    deleteListMutation.mutate();
  }

  function handleArchiveAllTasks() {
    if (!wsId || !boardId || tasks.length === 0) {
      setIsArchiveDialogOpen(false);
      return;
    }

    archiveAllTasksMutation.mutate();
  }

  // Handler for bulk moving all tasks from this list
  function handleMoveAllTasks() {
    if (tasks.length === 0) {
      toast.info(t('this_list_is_empty'));
      return;
    }
    setIsMoveAllDialogOpen(true);
  }

  // Handle the actual bulk move operation
  async function handleBulkMove(targetBoardId: string, targetListId: string) {
    if (tasks.length === 0) return;

    try {
      const result = await moveAllTasksFromListMutation.mutateAsync({
        sourceListId: listId,
        targetListId,
        targetBoardId: targetBoardId !== boardId ? targetBoardId : undefined,
      });

      if (result.movedCount > 0 && result.failedTaskIds.length > 0) {
        toast.warning(
          t('moved_tasks_partially', {
            moved: result.movedCount,
            failed: result.failedTaskIds.length,
          })
        );
      } else if (result.movedCount > 0) {
        toast.success(
          t('moved_tasks_successfully', {
            count: result.movedCount,
          })
        );
      }

      // Close dialog and refresh
      setIsMoveAllDialogOpen(false);
      onUpdate();
    } catch (error) {
      console.error('Failed to move all tasks:', error);
      // Don't close dialog on error so user can retry
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0 text-muted-foreground">
            <span className="sr-only">{t('open_menu')}</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canManageList && (
            <DropdownMenuItem onClick={() => onEditOpenChange(true)}>
              <div className="h-4 w-4">
                <Pencil className="h-4 w-4" />
              </div>
              {t('edit')}
            </DropdownMenuItem>
          )}
          {tasks.length > 0 && onSelectAll && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onSelectAll}>
                <div className="h-4 w-4">
                  <CheckSquare className="h-4 w-4 text-dynamic-green" />
                </div>
                {t('select_all_tasks')}
                <span className="ml-auto text-muted-foreground text-xs">
                  ({tasks.length})
                </span>
              </DropdownMenuItem>
            </>
          )}
          {canManageList && tasks.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleMoveAllTasks}>
                <div className="h-4 w-4">
                  <ArrowRightLeft className="h-4 w-4 text-dynamic-blue" />
                </div>
                {t('move_all_tasks')}
                <span className="ml-auto text-muted-foreground text-xs">
                  ({tasks.length})
                </span>
              </DropdownMenuItem>
            </>
          )}
          {canManageList && listStatus === 'done' && tasks.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setIsArchiveDialogOpen(true)}>
                <div className="h-4 w-4">
                  <Archive className="h-4 w-4 text-dynamic-purple" />
                </div>
                {t('archive_all_tasks')}
              </DropdownMenuItem>
            </>
          )}
          {canManageList && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setIsDeleteDialogOpen(true)}>
                <div className="h-4 w-4">
                  <Trash className="h-4 w-4 text-dynamic-red" />
                </div>
                {t('delete')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={canManageList && isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('delete_list')}</DialogTitle>
            <DialogDescription>
              {t('delete_list_confirmation')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {t('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditListDialog
        open={canManageList && isEditOpen}
        onOpenChange={onEditOpenChange}
        list={{
          id: listId,
          name: listName,
          status: listStatus,
          color: listColor ?? 'GRAY',
        }}
        isSaving={editListMutation.isPending}
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
        allowedStatuses={allowedStatuses}
      />

      <Dialog
        open={canManageList && isArchiveDialogOpen}
        onOpenChange={setIsArchiveDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('archive_all_tasks')}</DialogTitle>
            <DialogDescription>
              {t('archive_tasks_confirmation', { count: tasks.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsArchiveDialogOpen(false)}
              disabled={archiveAllTasksMutation.isPending}
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleArchiveAllTasks}
              disabled={archiveAllTasksMutation.isPending}
              className="bg-dynamic-purple hover:bg-dynamic-purple/90"
            >
              {archiveAllTasksMutation.isPending
                ? t('archiving')
                : t('archive_tasks')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          isMoving={moveAllTasksFromListMutation.isPending}
        />
      )}
    </>
  );
}
