import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
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
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import {
  Archive,
  ArrowRightLeft,
  CheckSquare,
  MoreHorizontal,
  Pencil,
  Trash,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import {
  deleteTaskList,
  useMoveAllTasksFromList,
  useMoveTask,
} from '@tuturuuu/utils/task-helper';
import { useState } from 'react';
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
}: Props) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isMoveAllDialogOpen, setIsMoveAllDialogOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [newName, setNewName] = useState(listName);

  const moveTaskMutation = useMoveTask(boardId);
  const moveAllTasksFromListMutation = useMoveAllTasksFromList(boardId);

  async function handleDelete() {
    const supabase = createClient();
    await deleteTaskList(supabase, listId);
    setIsDeleteDialogOpen(false);
    onUpdate();
  }

  async function handleUpdate() {
    if (!newName.trim() || newName === listName) {
      setIsEditDialogOpen(false);
      return;
    }

    const supabase = createClient();
    await supabase
      .from('task_lists')
      .update({ name: newName })
      .eq('id', listId);

    setIsEditDialogOpen(false);
    onUpdate();
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
        moveTaskMutation.mutate({
          taskId: task.id,
          newListId: closedListId,
        });
      }

      toast({
        title: 'Tasks Archived',
        description: `Successfully moved ${tasks.length} task${tasks.length !== 1 ? 's' : ''} to archive.`,
      });

      onUpdate();
    } catch (error) {
      console.error('Failed to archive tasks:', error);
      toast({
        title: 'Error',
        description: 'Failed to archive tasks. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsArchiving(false);
      setIsArchiveDialogOpen(false);
    }
  }

  // Handler for bulk moving all tasks from this list
  function handleMoveAllTasks() {
    if (tasks.length === 0) {
      toast({
        title: 'No tasks to move',
        description: 'This list is empty.',
        variant: 'default',
      });
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
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setIsEditDialogOpen(true)}>
            <div className="h-4 w-4">
              <Pencil className="h-4 w-4" />
            </div>
            Edit
          </DropdownMenuItem>
          {tasks.length > 0 && onSelectAll && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onSelectAll}>
                <div className="h-4 w-4">
                  <CheckSquare className="h-4 w-4 text-dynamic-green" />
                </div>
                Select all tasks
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
                Move all tasks
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
                Archive all tasks
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setIsDeleteDialogOpen(true)}>
            <div className="h-4 w-4">
              <Trash className="h-4 w-4 text-dynamic-red" />
            </div>
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete List</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this list? All tasks in this list
              will be deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit List</DialogTitle>
            <DialogDescription>Change the name of this list.</DialogDescription>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="List name"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive All Tasks</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive all {tasks.length} task
              {tasks.length !== 1 ? 's' : ''} from this list? They will be moved
              to the archive (closed status) and marked as completed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsArchiveDialogOpen(false)}
              disabled={isArchiving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleArchiveAllTasks}
              disabled={isArchiving}
              className="bg-dynamic-purple hover:bg-dynamic-purple/90"
            >
              {isArchiving ? 'Archiving...' : 'Archive Tasks'}
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
          taskCount={tasks.length}
          onMove={handleBulkMove}
          isMoving={moveAllTasksFromListMutation.isPending}
        />
      )}
    </>
  );
}
