'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { GripVertical, Lock, MoreVertical, Trash2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
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
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { useTaskDialog } from '../../hooks/useTaskDialog';
import { TaskCard } from './task';

interface Props {
  list: TaskList;
  tasks: Task[];
  boardId: string;
  onUpdate: () => void;
  isOverlay?: boolean;
  hideTasksMode?: boolean;
  isPersonalWorkspace?: boolean;
  onAddTask?: (list: TaskList) => void;
}

const colorClasses: Record<SupportedColor, string> = {
  GRAY: 'border-dynamic-gray/30 bg-dynamic-gray/10',
  RED: 'border-dynamic-red/30 bg-dynamic-red/10',
  BLUE: 'border-dynamic-blue/30 bg-dynamic-blue/10',
  GREEN: 'border-dynamic-green/30 bg-dynamic-green/10',
  YELLOW: 'border-dynamic-yellow/30 bg-dynamic-yellow/10',
  ORANGE: 'border-dynamic-orange/30 bg-dynamic-orange/10',
  PURPLE: 'border-dynamic-purple/30 bg-dynamic-purple/10',
  PINK: 'border-dynamic-pink/30 bg-dynamic-pink/10',
  INDIGO: 'border-dynamic-indigo/30 bg-dynamic-indigo/10',
  CYAN: 'border-dynamic-cyan/30 bg-dynamic-cyan/10',
};

const colorOptions: { value: SupportedColor; label: string; class: string }[] =
  [
    { value: 'GRAY', label: 'Gray', class: 'bg-dynamic-gray/30' },
    { value: 'RED', label: 'Red', class: 'bg-dynamic-red/30' },
    { value: 'BLUE', label: 'Blue', class: 'bg-dynamic-blue/30' },
    { value: 'GREEN', label: 'Green', class: 'bg-dynamic-green/30' },
    { value: 'YELLOW', label: 'Yellow', class: 'bg-dynamic-yellow/30' },
    { value: 'ORANGE', label: 'Orange', class: 'bg-dynamic-orange/30' },
    { value: 'PURPLE', label: 'Purple', class: 'bg-dynamic-purple/30' },
    { value: 'PINK', label: 'Pink', class: 'bg-dynamic-pink/30' },
    { value: 'INDIGO', label: 'Indigo', class: 'bg-dynamic-indigo/30' },
    { value: 'CYAN', label: 'Cyan', class: 'bg-dynamic-cyan/30' },
  ];

const statusIcons = {
  documents: '📄',
  not_started: '⚪',
  active: '🔵',
  done: '🟢',
  closed: '🟣',
};

export function EnhancedTaskList({
  list,
  tasks,
  boardId,
  onUpdate,
  isOverlay = false,
  hideTasksMode = false,
  isPersonalWorkspace = false,
  onAddTask,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(list.name);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const queryClient = useQueryClient();
  const supabase = createClient();
  const { createTask } = useTaskDialog();

  // Draggable for the list itself
  const {
    attributes: listAttributes,
    listeners: listListeners,
    setNodeRef: setListNodeRef,
    transform: listTransform,
    transition: listTransition,
    isDragging: isListDragging,
  } = useSortable({
    id: list.id,
    data: {
      type: 'List',
      list,
    },
  });

  // Droppable for tasks within this list
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: `list-drop-${list.id}`,
    data: {
      type: 'List',
      list,
    },
  });

  const listStyle = {
    transform: CSS.Transform.toString(listTransform),
    transition: listTransition,
  };

  // Update list name mutation
  const updateListMutation = useMutation({
    mutationFn: async (newName: string) => {
      const { error } = await supabase
        .from('task_lists')
        .update({ name: newName })
        .eq('id', list.id);

      if (error) throw error;
      return newName;
    },
    onSuccess: (newName) => {
      // Use setQueryData for immediate UI update without flicker
      // Realtime subscription handles cross-user sync
      queryClient.setQueryData(
        ['task_lists', boardId],
        (old: TaskList[] | undefined) => {
          if (!old) return old;
          return old.map((l) =>
            l.id === list.id ? { ...l, name: newName } : l
          );
        }
      );
      toast.success('List name updated');
      onUpdate();
    },
    onError: (error) => {
      console.error('Failed to update list name:', error);
      toast.error('Failed to update list name');
    },
  });

  // Update list color mutation
  const updateColorMutation = useMutation({
    mutationFn: async (newColor: SupportedColor) => {
      const { error } = await supabase
        .from('task_lists')
        .update({ color: newColor })
        .eq('id', list.id);

      if (error) throw error;
      return newColor;
    },
    onSuccess: (newColor) => {
      // Use setQueryData for immediate UI update without flicker
      // Realtime subscription handles cross-user sync
      queryClient.setQueryData(
        ['task_lists', boardId],
        (old: TaskList[] | undefined) => {
          if (!old) return old;
          return old.map((l) =>
            l.id === list.id ? { ...l, color: newColor } : l
          );
        }
      );
      toast.success('List color updated');
      onUpdate();
    },
    onError: (error) => {
      console.error('Failed to update list color:', error);
      toast.error('Failed to update list color');
    },
  });

  // Delete list mutation
  const deleteListMutation = useMutation({
    mutationFn: async () => {
      // First, delete all tasks in this list
      if (tasks.length > 0) {
        const { error: tasksError } = await supabase
          .from('tasks')
          .delete()
          .eq('list_id', list.id);

        if (tasksError) throw tasksError;
      }

      // Then delete the list itself
      const { error } = await supabase
        .from('task_lists')
        .delete()
        .eq('id', list.id);

      if (error) throw error;
    },
    onSuccess: () => {
      // Use setQueryData for immediate UI update without flicker
      // Realtime subscription handles cross-user sync
      queryClient.setQueryData(
        ['task_lists', boardId],
        (old: TaskList[] | undefined) => {
          if (!old) return old;
          return old.filter((l) => l.id !== list.id);
        }
      );
      queryClient.setQueryData(
        ['tasks', boardId],
        (old: Task[] | undefined) => {
          if (!old) return old;
          return old.filter((t) => t.list_id !== list.id);
        }
      );
      toast.success(
        tasks.length > 0
          ? `List and ${tasks.length} task${tasks.length > 1 ? 's' : ''} deleted`
          : 'List deleted'
      );
      onUpdate();
    },
    onError: (error) => {
      console.error('Failed to delete list:', error);
      toast.error('Failed to delete list');
    },
  });

  const handleNameSave = () => {
    if (editName.trim() !== list.name) {
      updateListMutation.mutate(editName.trim());
    }
    setIsEditing(false);
  };

  const handleNameCancel = () => {
    setEditName(list.name);
    setIsEditing(false);
  };

  const handleDeleteConfirm = () => {
    deleteListMutation.mutate();
    setShowDeleteDialog(false);
  };

  const handleDeleteCancel = () => {
    setShowDeleteDialog(false);
  };

  const colorClass =
    colorClasses[list.color as SupportedColor] || colorClasses.GRAY;
  const statusIcon = statusIcons[list.status] || '⚪';
  const isClosed = list.status === 'closed';
  const isUpdating =
    updateListMutation.isPending ||
    updateColorMutation.isPending ||
    deleteListMutation.isPending;

  return (
    <Card
      ref={(node) => {
        setListNodeRef(node);
        setDropNodeRef(node);
      }}
      style={listStyle}
      className={cn(
        'group relative flex flex-col border-l-4 transition-all duration-200',
        colorClass,
        isListDragging &&
          'rotate-2 scale-105 opacity-90 shadow-xl ring-2 ring-primary/20',
        isOver && 'ring-2 ring-primary/30',
        isOverlay && 'shadow-2xl',
        'touch-none select-none hover:shadow-md',
        isUpdating && 'opacity-75'
      )}
    >
      {/* List Header */}
      <div className="flex items-center gap-2 rounded-lg p-3">
        {/* Drag Handle */}
        <div
          {...listAttributes}
          {...listListeners}
          className={cn(
            'cursor-grab rounded p-1 opacity-40 transition-all',
            'hover:bg-black/5 group-hover:opacity-70',
            isListDragging && 'cursor-grabbing opacity-100'
          )}
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Status Icon */}
        <span className="text-sm">{statusIcon}</span>

        {/* List Name */}
        <div className="min-w-0 flex-1">
          {isEditing && !isClosed ? (
            <div className="flex gap-1">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNameSave();
                  if (e.key === 'Escape') handleNameCancel();
                }}
                onBlur={handleNameSave}
                className="h-7 text-sm"
                autoFocus
              />
            </div>
          ) : (
            <button
              type="button"
              className={cn(
                'truncate font-medium text-foreground text-sm',
                !isClosed && 'cursor-pointer hover:text-primary',
                isClosed && 'text-muted-foreground'
              )}
              onClick={() => !isClosed && setIsEditing(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (!isClosed) setIsEditing(true);
                }
              }}
              disabled={isClosed}
            >
              {list.name}
              {isClosed && <Lock className="ml-1 inline h-3 w-3" />}
            </button>
          )}
        </div>

        {/* Task Count Badge */}
        {hideTasksMode ? (
          <Badge variant="outline" className="text-muted-foreground text-xs">
            Hidden
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-xs">
            {tasks.length}
          </Badge>
        )}

        {/* Actions Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 opacity-40 group-hover:opacity-70"
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1 font-medium text-muted-foreground text-xs">
              Change Color
            </div>
            <div className="grid grid-cols-5 gap-1 p-2">
              {colorOptions.map((color) => (
                <button
                  type="button"
                  key={color.value}
                  onClick={() => updateColorMutation.mutate(color.value)}
                  className={cn(
                    'h-6 w-6 rounded border-2 transition-all',
                    color.class,
                    list.color === color.value &&
                      'scale-110 ring-2 ring-primary'
                  )}
                  title={color.label}
                />
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive focus:text-destructive"
              disabled={isClosed}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete list
              {tasks.length > 0 && (
                <span className="ml-auto text-xs">
                  ({tasks.length} task{tasks.length > 1 ? 's' : ''})
                </span>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tasks Area */}
      <div
        className={cn(
          'min-h-24 flex-1 space-y-2 p-3',
          isOver && 'bg-primary/5'
        )}
      >
        {hideTasksMode ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-3 rounded-full bg-dynamic-purple/20 p-3">
              <svg
                className="h-6 w-6 text-dynamic-purple/60"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                role="img"
                aria-label="Tasks hidden icon"
              >
                <title>Tasks Hidden</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L8.465 8.465m1.413 1.413L18.75 18.75m-7.036-7.036L12 12m-1.036-1.036L9.465 9.465m9.193 9.193L20.75 20.75M4.222 4.222l16.556 16.556"
                />
              </svg>
            </div>
            <p className="font-medium text-muted-foreground text-sm">
              Tasks Hidden
            </p>
            <p className="mt-1 text-muted-foreground/80 text-xs">
              Task details are hidden in structure view
            </p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <p className="text-center text-xs">
              {isClosed ? 'Closed list' : 'No tasks yet'}
            </p>
          </div>
        ) : (
          <SortableContext
            items={tasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                taskList={list}
                boardId={boardId}
                isPersonalWorkspace={isPersonalWorkspace}
                onUpdate={onUpdate}
              />
            ))}
          </SortableContext>
        )}
      </div>

      {/* Add Task Form */}
      {!isClosed && !hideTasksMode && (
        <div className="border-t p-2 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onAddTask ? onAddTask(list) : createTask(boardId, list.id, [list])
            }
            className="w-full justify-start rounded-lg border border-dynamic-gray/40 border-dashed text-muted-foreground text-xs transition-all hover:border-dynamic-gray/60 hover:bg-muted/40 hover:text-foreground"
          >
            + Add task
          </Button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete List</DialogTitle>
            <DialogDescription>
              {tasks.length > 0
                ? `This will permanently delete "${list.name}" and all ${tasks.length} task${tasks.length > 1 ? 's' : ''} in it. This action cannot be undone.`
                : `This will permanently delete "${list.name}". This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleDeleteCancel}
              disabled={deleteListMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteListMutation.isPending}
            >
              {deleteListMutation.isPending ? 'Deleting...' : 'Delete List'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
