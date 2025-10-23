'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Circle,
  CircleCheck,
  CircleDashed,
  CircleX,
  GripVertical,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
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
import { Label } from '@tuturuuu/ui/label';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useState } from 'react';
import { CreateListDialog } from './create-list-dialog';

interface BoardLayoutSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  lists: TaskList[];
  onUpdate: () => void;
}

const statusConfig = {
  not_started: {
    icon: CircleDashed,
    label: 'Backlog',
    color: 'text-dynamic-gray',
    bgColor: 'bg-dynamic-gray/10',
    borderColor: 'border-dynamic-gray/30',
  },
  active: {
    icon: Circle,
    label: 'Active',
    color: 'text-dynamic-blue',
    bgColor: 'bg-dynamic-blue/10',
    borderColor: 'border-dynamic-blue/30',
  },
  done: {
    icon: CircleCheck,
    label: 'Done',
    color: 'text-dynamic-green',
    bgColor: 'bg-dynamic-green/10',
    borderColor: 'border-dynamic-green/30',
  },
  closed: {
    icon: CircleX,
    label: 'Closed',
    color: 'text-dynamic-purple',
    bgColor: 'bg-dynamic-purple/10',
    borderColor: 'border-dynamic-purple/30',
  },
};

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

interface SortableListItemProps {
  list: TaskList;
  taskCount: number;
  onEdit: (list: TaskList) => void;
  onDelete: (list: TaskList) => void;
  onColorChange: (listId: string, color: SupportedColor) => void;
  isDragging?: boolean;
}

function SortableListItem({
  list,
  taskCount,
  onEdit,
  onDelete,
  onColorChange,
  isDragging,
}: SortableListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: list.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const StatusIcon = statusConfig[list.status].icon;
  const listColor = (list.color as SupportedColor) || 'GRAY';
  const colorClass = colorClasses[listColor] || colorClasses.GRAY;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center gap-3 rounded-lg border-l-4 bg-background p-3 transition-all',
        (isDragging || isSortableDragging) && 'opacity-50',
        'hover:border-primary/50 hover:shadow-sm',
        colorClass
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md',
            statusConfig[list.status].bgColor
          )}
        >
          <StatusIcon
            className={cn('h-4 w-4', statusConfig[list.status].color)}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-sm">{list.name}</span>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
            </Badge>
          </div>
          <p className="truncate text-muted-foreground text-xs">
            {statusConfig[list.status].label}
          </p>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <MoreVertical className="h-4 w-4" />
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
                onClick={() => onColorChange(list.id, color.value)}
                className={cn(
                  'h-6 w-6 rounded border-2 transition-all',
                  color.class,
                  listColor === color.value && 'scale-110 ring-2 ring-primary'
                )}
                title={color.label}
              />
            ))}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onEdit(list)} className="gap-2">
            <Pencil className="h-4 w-4" />
            Edit List
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDelete(list)}
            className="gap-2 text-dynamic-red/80 focus:text-dynamic-red"
          >
            <Trash2 className="h-4 w-4" />
            Delete List
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function BoardLayoutSettings({
  open,
  onOpenChange,
  boardId,
  lists,
  onUpdate,
}: BoardLayoutSettingsProps) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  const [editingList, setEditingList] = useState<TaskList | null>(null);
  const [deletingList, setDeletingList] = useState<TaskList | null>(null);
  const [creatingList, setCreatingList] = useState(false);

  // Group lists by status
  const groupedLists = lists.reduce(
    (acc, list) => {
      if (!acc[list.status]) {
        acc[list.status] = [];
      }
      acc[list.status].push(list);
      return acc;
    },
    {} as Record<TaskBoardStatus, TaskList[]>
  );

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const updateListMutation = useMutation({
    mutationFn: async ({
      listId,
      updates,
    }: {
      listId: string;
      updates: Partial<TaskList>;
    }) => {
      const { error } = await supabase
        .from('task_lists')
        .update(updates)
        .eq('id', listId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('List updated successfully');
      queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
      setEditingList(null);
      onUpdate();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update list');
    },
  });

  const updateColorMutation = useMutation({
    mutationFn: async ({
      listId,
      color,
    }: {
      listId: string;
      color: SupportedColor;
    }) => {
      const { error } = await supabase
        .from('task_lists')
        .update({ color })
        .eq('id', listId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Color updated');
      queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
      onUpdate();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update color');
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: async (listId: string) => {
      const { error } = await supabase
        .from('task_lists')
        .delete()
        .eq('id', listId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('List deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      setDeletingList(null);
      onUpdate();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete list');
    },
  });

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) return;

      // Find the dragged list
      const draggedList = lists.find((l) => l.id === active.id);
      if (!draggedList) return;

      // Find which status the target belongs to
      let targetStatus: TaskBoardStatus | null = null;

      for (const [s, statusLists] of Object.entries(groupedLists)) {
        const found = statusLists.find((l) => l.id === over.id);
        if (found) {
          targetStatus = s as TaskBoardStatus;
          break;
        }
      }

      if (!targetStatus) return;

      // Prevent moving to/from closed status
      if (draggedList.status === 'closed' || targetStatus === 'closed') {
        toast.error('Cannot move lists to or from closed status');
        return;
      }

      // Store snapshot for rollback
      const previousLists = queryClient.getQueryData<TaskList[]>([
        'task_lists',
        boardId,
      ]);

      // Check if moving within same status or across statuses
      if (draggedList.status === targetStatus) {
        // Same status - reorder
        const statusLists = groupedLists[targetStatus] || [];
        const oldIndex = statusLists.findIndex((l) => l.id === active.id);
        const newIndex = statusLists.findIndex((l) => l.id === over.id);

        if (oldIndex === -1 || newIndex === -1) return;

        const newOrder = arrayMove(statusLists, oldIndex, newIndex);

        // Optimistically update
        queryClient.setQueryData(
          ['task_lists', boardId],
          (oldData: TaskList[] | undefined) => {
            if (!oldData) return oldData;
            return oldData.map((list) => {
              const newPos = newOrder.findIndex((l) => l.id === list.id);
              return newPos !== -1 ? { ...list, position: newPos } : list;
            });
          }
        );

        // Persist changes
        try {
          await Promise.all(
            newOrder.map((list, index) =>
              supabase
                .from('task_lists')
                .update({ position: index })
                .eq('id', list.id)
            )
          );
          toast.success('Lists reordered');
        } catch (error) {
          console.error('Failed to reorder lists:', error);
          toast.error('Failed to reorder lists');
          if (previousLists) {
            queryClient.setQueryData(['task_lists', boardId], previousLists);
          } else {
            queryClient.invalidateQueries({
              queryKey: ['task_lists', boardId],
            });
          }
        }
      } else {
        // Cross-status move
        const targetStatusLists = (groupedLists[targetStatus] || []).sort(
          (a, b) => a.position - b.position
        );

        // Find insertion position
        const insertIndex = targetStatusLists.findIndex(
          (l) => l.id === over.id
        );

        let newPosition: number;
        if (insertIndex === 0) {
          // Insert at beginning
          newPosition = (targetStatusLists[0]?.position || 0) - 1;
        } else if (insertIndex > 0) {
          // Insert between
          const prevPos = targetStatusLists[insertIndex - 1]?.position || 0;
          const nextPos = targetStatusLists[insertIndex]?.position || 0;
          newPosition = (prevPos + nextPos) / 2;
        } else {
          // Append to end
          newPosition =
            Math.max(0, ...targetStatusLists.map((l) => l.position || 0)) + 1;
        }

        // Optimistically update
        queryClient.setQueryData(
          ['task_lists', boardId],
          (oldData: TaskList[] | undefined) => {
            if (!oldData) return oldData;
            return oldData.map((list) =>
              list.id === draggedList.id
                ? { ...list, status: targetStatus, position: newPosition }
                : list
            );
          }
        );

        // Persist to database
        try {
          const { error } = await supabase
            .from('task_lists')
            .update({
              status: targetStatus,
              position: newPosition,
            })
            .eq('id', draggedList.id);

          if (error) throw error;
          toast.success(`Moved to ${statusConfig[targetStatus].label}`);
        } catch (error) {
          console.error('Failed to move list:', error);
          toast.error('Failed to move list');
          if (previousLists) {
            queryClient.setQueryData(['task_lists', boardId], previousLists);
          } else {
            queryClient.invalidateQueries({
              queryKey: ['task_lists', boardId],
            });
          }
        }
      }
    },
    [boardId, groupedLists, lists, queryClient, supabase]
  );

  const handleColorChange = (listId: string, color: SupportedColor) => {
    updateColorMutation.mutate({ listId, color });
  };

  const statuses: TaskBoardStatus[] = [
    'not_started',
    'active',
    'done',
    'closed',
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Board Layout Settings</DialogTitle>
            <DialogDescription>
              Manage your board columns and organize them by status. Drag to
              reorder within each status group.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Add New List Button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setCreatingList(true)}
            >
              <Plus className="h-4 w-4" />
              Add New List
            </Button>

            {/* Lists by Status */}
            <ScrollArea className="h-[500px] pr-4">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <div className="space-y-6">
                  {statuses.map((status) => {
                    const StatusIcon = statusConfig[status].icon;
                    const statusLists = (groupedLists[status] || []).sort(
                      (a, b) => a.position - b.position
                    );

                    return (
                      <div key={status} className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded',
                              statusConfig[status].bgColor
                            )}
                          >
                            <StatusIcon
                              className={cn(
                                'h-3.5 w-3.5',
                                statusConfig[status].color
                              )}
                            />
                          </div>
                          <h3 className="font-semibold text-sm">
                            {statusConfig[status].label}
                          </h3>
                          <Badge variant="secondary" className="text-[10px]">
                            {statusLists.length}
                          </Badge>
                        </div>

                        {statusLists.length === 0 ? (
                          <div className="rounded-lg border-2 border-dashed p-4 text-center">
                            <p className="text-muted-foreground text-sm">
                              No lists in this status
                            </p>
                          </div>
                        ) : (
                          <SortableContext
                            items={statusLists.map((l) => l.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {statusLists.map((list) => (
                                <SortableListItem
                                  key={list.id}
                                  list={list}
                                  taskCount={0}
                                  onEdit={setEditingList}
                                  onDelete={setDeletingList}
                                  onColorChange={handleColorChange}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        )}
                      </div>
                    );
                  })}
                </div>
              </DndContext>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create List Dialog */}
      <CreateListDialog
        open={creatingList}
        onOpenChange={setCreatingList}
        boardId={boardId}
        onSuccess={() => {
          onUpdate();
        }}
      />

      {/* Edit List Dialog */}
      {editingList && (
        <Dialog open={!!editingList} onOpenChange={() => setEditingList(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit List</DialogTitle>
              <DialogDescription>
                Update the list name and status category.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">List Name</Label>
                <Input
                  defaultValue={editingList.name}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      updateListMutation.mutate({
                        listId: editingList.id,
                        updates: {
                          name: (e.target as HTMLInputElement).value.trim(),
                        },
                      });
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status Category</Label>
                <Select
                  defaultValue={editingList.status}
                  onValueChange={(value) => {
                    updateListMutation.mutate({
                      listId: editingList.id,
                      updates: { status: value as TaskBoardStatus },
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((status) => {
                      const Icon = statusConfig[status].icon;
                      return (
                        <SelectItem key={status} value={status}>
                          <div className="flex items-center gap-2">
                            <Icon
                              className={cn(
                                'h-4 w-4',
                                statusConfig[status].color
                              )}
                            />
                            {statusConfig[status].label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <div className="grid grid-cols-5 gap-2">
                  {colorOptions.map((color) => (
                    <button
                      type="button"
                      key={color.value}
                      onClick={() =>
                        updateColorMutation.mutate({
                          listId: editingList.id,
                          color: color.value,
                        })
                      }
                      className={cn(
                        'h-8 w-8 rounded border-2 transition-all',
                        color.class,
                        editingList.color === color.value &&
                          'scale-110 ring-2 ring-primary'
                      )}
                      title={color.label}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEditingList(null)}
                disabled={updateListMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const nameInput = document.getElementById(
                    'edit-name'
                  ) as HTMLInputElement;
                  if (nameInput?.value.trim()) {
                    updateListMutation.mutate({
                      listId: editingList.id,
                      updates: { name: nameInput.value.trim() },
                    });
                  }
                }}
                disabled={updateListMutation.isPending}
              >
                {updateListMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingList}
        onOpenChange={() => setDeletingList(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete List?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingList?.name}&quot;?
              All tasks in this list will also be deleted. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteListMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingList) {
                  deleteListMutation.mutate(deletingList.id);
                }
              }}
              disabled={deleteListMutation.isPending}
              className="bg-dynamic-red/90 text-white hover:bg-dynamic-red"
            >
              {deleteListMutation.isPending ? 'Deleting...' : 'Delete List'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
