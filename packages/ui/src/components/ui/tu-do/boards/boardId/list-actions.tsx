import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowRightLeft,
  CheckSquare,
  MoreHorizontal,
  Pencil,
  Trash,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
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
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import {
  deleteTaskList,
  useMoveAllTasksFromList,
  useMoveTask,
} from '@tuturuuu/utils/task-helper';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useBoardBroadcast } from '../../shared/board-broadcast-context';
import { BoardSelector } from '../board-selector';

interface Props {
  listId: string;
  listName: string;
  listStatus?: string;
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
  tasks = [],
  boardId = '',
  wsId = '',
  onUpdate,
  onSelectAll,
  isEditOpen,
  onEditOpenChange,
}: Props) {
  const t = useTranslations('common');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isMoveAllDialogOpen, setIsMoveAllDialogOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [newName, setNewName] = useState(listName);

  const queryClient = useQueryClient();
  const broadcast = useBoardBroadcast();
  const moveTaskMutation = useMoveTask(boardId);
  const moveAllTasksFromListMutation = useMoveAllTasksFromList(
    boardId,
    broadcast
  );

  async function handleDelete() {
    const supabase = createClient();
    await deleteTaskList(supabase, listId);
    setIsDeleteDialogOpen(false);
    onUpdate();
  }

  async function handleUpdate() {
    if (!newName.trim() || newName === listName) {
      onEditOpenChange(false);
      return;
    }

    const trimmedName = newName.trim();

    // Optimistic cache update
    queryClient.setQueryData(
      ['task_lists', boardId],
      (old: TaskList[] | undefined) => {
        if (!old) return old;
        return old.map((l) =>
          l.id === listId ? { ...l, name: trimmedName } : l
        );
      }
    );

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('task_lists')
        .update({ name: trimmedName })
        .eq('id', listId);
      if (error) throw error;

      broadcast?.('list:upsert', { list: { id: listId, name: trimmedName } });
      toast.success(t('name_updated'));
      onEditOpenChange(false);
      onUpdate();
    } catch (e: unknown) {
      // Rollback on error
      queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
      toast.error(e instanceof Error ? e.message : t('save_failed'));
    }
  }

  async function handleArchiveAllTasks() {
    if (!boardId || tasks.length === 0) {
      setIsArchiveDialogOpen(false);
      return;
    }

    setIsArchiving(true);

    try {
      const supabase = createClient();

      // Find or create a closed status list
      const { data: existingClosedLists, error: fetchError } = await supabase
        .from('task_lists')
        .select('*')
        .eq('board_id', boardId)
        .eq('status', 'closed')
        .eq('deleted', false)
        .limit(1);

      if (fetchError) throw fetchError;

      let closedListId: string;

      if (existingClosedLists && existingClosedLists.length > 0) {
        // Use existing closed list
        const firstClosedList = existingClosedLists[0];
        if (firstClosedList) {
          closedListId = firstClosedList.id;
        } else {
          throw new Error('No closed list found despite length check');
        }
      } else {
        // Create new closed list
        const { data: newClosedList, error: createError } = await supabase
          .from('task_lists')
          .insert({
            name: 'Archived',
            status: 'closed',
            board_id: boardId,
            position: 0,
            color: 'PURPLE',
          })
          .select()
          .single();

        if (createError) throw createError;
        closedListId = newClosedList.id;
      }

      // Move all tasks to the closed list
      for (const task of tasks) {
        moveTaskMutation.mutate(
          {
            taskId: task.id,
            newListId: closedListId,
          },
          {
            onSuccess: (updatedTask) => {
              broadcast?.('task:upsert', {
                task: {
                  id: updatedTask.id,
                  list_id: updatedTask.list_id,
                  completed_at: updatedTask.completed_at,
                  closed_at: updatedTask.closed_at,
                },
              });
            },
          }
        );
      }

      toast.success(
        `Successfully moved ${tasks.length} task${tasks.length !== 1 ? 's' : ''} to archive.`
      );

      onUpdate();
    } catch (error) {
      console.error('Failed to archive tasks:', error);
      toast.error(t('failed_to_archive_tasks'));
    } finally {
      setIsArchiving(false);
      setIsArchiveDialogOpen(false);
    }
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
      await moveAllTasksFromListMutation.mutateAsync({
        sourceListId: listId,
        targetListId,
        targetBoardId: targetBoardId !== boardId ? targetBoardId : undefined,
      });

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
          <DropdownMenuItem onClick={() => onEditOpenChange(true)}>
            <div className="h-4 w-4">
              <Pencil className="h-4 w-4" />
            </div>
            {t('edit')}
          </DropdownMenuItem>
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
          {tasks.length > 0 && wsId && (
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
          {listStatus === 'done' && tasks.length > 0 && (
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
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setIsDeleteDialogOpen(true)}>
            <div className="h-4 w-4">
              <Trash className="h-4 w-4 text-dynamic-red" />
            </div>
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
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

      <Dialog open={isEditOpen} onOpenChange={onEditOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('edit_list')}</DialogTitle>
            <DialogDescription>{t('change_list_name')}</DialogDescription>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleUpdate();
              }
            }}
            placeholder={t('list_name')}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => onEditOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleUpdate}>{t('save_changes')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
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
              disabled={isArchiving}
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleArchiveAllTasks}
              disabled={isArchiving}
              className="bg-dynamic-purple hover:bg-dynamic-purple/90"
            >
              {isArchiving ? t('archiving') : t('archive_tasks')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Board Selector for Moving All Tasks */}
      {wsId && (
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
