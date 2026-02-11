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
  FileText,
  GripVertical,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceTaskList } from '@tuturuuu/types';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
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
import { useCallback, useMemo, useState } from 'react';
import {
  getActiveBroadcast,
  useBoardBroadcast,
} from './board-broadcast-context';
import { CreateListDialog } from './create-list-dialog';

interface BoardLayoutSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  lists: WorkspaceTaskList[];
  onUpdate: () => void;
  translations?: {
    boardLayoutSettings?: string;
    boardLayoutSettingsDescription?: string;
    addNewList?: string;
    noListsInStatus?: string;
    done?: string;
    editList?: string;
    updateListDescription?: string;
    listName?: string;
    statusCategory?: string;
    color?: string;
    cancel?: string;
    saving?: string;
    saveChanges?: string;
    deleteListTitle?: string;
    deleteListDescription?: string;
    deleteListConfirm?: string;
    listUpdatedSuccessfully?: string;
    failedToUpdateList?: string;
    colorUpdated?: string;
    failedToUpdateColor?: string;
    listDeletedSuccessfully?: string;
    failedToDeleteList?: string;
    cannotMoveToClosedStatus?: string;
    listsReordered?: string;
    failedToReorderLists?: string;
    movedToStatus?: string;
    // Status labels
    backlog?: string;
    active?: string;
    doneStatus?: string;
    closed?: string;
    documents?: string;
    // Common
    task?: string;
    tasks?: string;
    changeColor?: string;
    deleteList?: string;
    gray?: string;
    red?: string;
    blue?: string;
    green?: string;
    yellow?: string;
    orange?: string;
    purple?: string;
    pink?: string;
    indigo?: string;
    cyan?: string;
  };
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
  documents: {
    icon: FileText,
    label: 'Documents',
    color: 'text-dynamic-cyan',
    bgColor: 'bg-dynamic-cyan/10',
    borderColor: 'border-dynamic-cyan/30',
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

interface SortableListItemProps {
  list: WorkspaceTaskList;
  taskCount: number;
  onEdit: (list: WorkspaceTaskList) => void;
  onDelete: (list: WorkspaceTaskList) => void;
  onColorChange: (listId: string, color: SupportedColor) => void;
  isDragging?: boolean;
  translations?: {
    task?: string;
    tasks?: string;
    changeColor?: string;
    editList?: string;
    deleteList?: string;
    backlog?: string;
    active?: string;
    doneStatus?: string;
    closed?: string;
    documents?: string;
    gray?: string;
    red?: string;
    blue?: string;
    green?: string;
    yellow?: string;
    orange?: string;
    purple?: string;
    pink?: string;
    indigo?: string;
    cyan?: string;
  };
}

function SortableListItem({
  list,
  taskCount,
  onEdit,
  onDelete,
  onColorChange,
  isDragging,
  translations,
}: SortableListItemProps) {
  const t = {
    task: translations?.task ?? 'task',
    tasks: translations?.tasks ?? 'tasks',
    changeColor: translations?.changeColor ?? 'Change Color',
    editList: translations?.editList ?? 'Edit List',
    deleteList: translations?.deleteList ?? 'Delete List',
    backlog: translations?.backlog ?? 'Backlog',
    active: translations?.active ?? 'Active',
    doneStatus: translations?.doneStatus ?? 'Done',
    closed: translations?.closed ?? 'Closed',
    documents: translations?.documents ?? 'Documents',
    gray: translations?.gray ?? 'Gray',
    red: translations?.red ?? 'Red',
    blue: translations?.blue ?? 'Blue',
    green: translations?.green ?? 'Green',
    yellow: translations?.yellow ?? 'Yellow',
    orange: translations?.orange ?? 'Orange',
    purple: translations?.purple ?? 'Purple',
    pink: translations?.pink ?? 'Pink',
    indigo: translations?.indigo ?? 'Indigo',
    cyan: translations?.cyan ?? 'Cyan',
  };

  const statusLabels: Record<TaskBoardStatus, string> = {
    not_started: t.backlog,
    active: t.active,
    done: t.doneStatus,
    closed: t.closed,
    documents: t.documents,
  };

  const colorOptions = useMemo(
    () => [
      {
        value: 'GRAY' as SupportedColor,
        label: t.gray,
        class: 'bg-dynamic-gray/30',
      },
      {
        value: 'RED' as SupportedColor,
        label: t.red,
        class: 'bg-dynamic-red/30',
      },
      {
        value: 'BLUE' as SupportedColor,
        label: t.blue,
        class: 'bg-dynamic-blue/30',
      },
      {
        value: 'GREEN' as SupportedColor,
        label: t.green,
        class: 'bg-dynamic-green/30',
      },
      {
        value: 'YELLOW' as SupportedColor,
        label: t.yellow,
        class: 'bg-dynamic-yellow/30',
      },
      {
        value: 'ORANGE' as SupportedColor,
        label: t.orange,
        class: 'bg-dynamic-orange/30',
      },
      {
        value: 'PURPLE' as SupportedColor,
        label: t.purple,
        class: 'bg-dynamic-purple/30',
      },
      {
        value: 'PINK' as SupportedColor,
        label: t.pink,
        class: 'bg-dynamic-pink/30',
      },
      {
        value: 'INDIGO' as SupportedColor,
        label: t.indigo,
        class: 'bg-dynamic-indigo/30',
      },
      {
        value: 'CYAN' as SupportedColor,
        label: t.cyan,
        class: 'bg-dynamic-cyan/30',
      },
    ],
    [
      t.gray,
      t.red,
      t.blue,
      t.green,
      t.yellow,
      t.orange,
      t.purple,
      t.pink,
      t.indigo,
      t.cyan,
    ]
  );

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

  const StatusIcon = list.status && statusConfig[list.status].icon;
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
        {list.status && StatusIcon && (
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
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-sm">{list.name}</span>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {taskCount} {taskCount === 1 ? t.task : t.tasks}
            </Badge>
          </div>
          <p className="truncate text-muted-foreground text-xs">
            {list.status && statusLabels[list.status]}
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
            {t.changeColor}
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
            {t.editList}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDelete(list)}
            className="gap-2 text-dynamic-red/80 focus:text-dynamic-red"
          >
            <Trash2 className="h-4 w-4" />
            {t.deleteList}
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
  translations,
}: BoardLayoutSettingsProps) {
  const t = useMemo(
    () => ({
      boardLayoutSettings:
        translations?.boardLayoutSettings ?? 'Board Layout Settings',
      boardLayoutSettingsDescription:
        translations?.boardLayoutSettingsDescription ??
        'Manage your board columns and organize them by status. Drag to reorder within each status group.',
      addNewList: translations?.addNewList ?? 'Add New List',
      noListsInStatus:
        translations?.noListsInStatus ?? 'No lists in this status',
      done: translations?.done ?? 'Done',
      editList: translations?.editList ?? 'Edit List',
      updateListDescription:
        translations?.updateListDescription ??
        'Update the list name and status category.',
      listName: translations?.listName ?? 'List Name',
      statusCategory: translations?.statusCategory ?? 'Status Category',
      color: translations?.color ?? 'Color',
      cancel: translations?.cancel ?? 'Cancel',
      saving: translations?.saving ?? 'Saving...',
      saveChanges: translations?.saveChanges ?? 'Save Changes',
      deleteListTitle: translations?.deleteListTitle ?? 'Delete List?',
      deleteListDescription:
        translations?.deleteListDescription ??
        'Are you sure you want to delete this list? All tasks in this list will also be deleted. This action cannot be undone.',
      deleteListConfirm: translations?.deleteListConfirm ?? 'Delete List',
      listUpdatedSuccessfully:
        translations?.listUpdatedSuccessfully ?? 'List updated successfully',
      failedToUpdateList:
        translations?.failedToUpdateList ?? 'Failed to update list',
      colorUpdated: translations?.colorUpdated ?? 'Color updated',
      failedToUpdateColor:
        translations?.failedToUpdateColor ?? 'Failed to update color',
      listDeletedSuccessfully:
        translations?.listDeletedSuccessfully ?? 'List deleted successfully',
      failedToDeleteList:
        translations?.failedToDeleteList ?? 'Failed to delete list',
      cannotMoveToClosedStatus:
        translations?.cannotMoveToClosedStatus ??
        'Cannot move lists to or from closed status',
      listsReordered: translations?.listsReordered ?? 'Lists reordered',
      failedToReorderLists:
        translations?.failedToReorderLists ?? 'Failed to reorder lists',
      movedToStatus: translations?.movedToStatus ?? 'Moved to {status}',
      // Status labels
      backlog: translations?.backlog ?? 'Backlog',
      active: translations?.active ?? 'Active',
      doneStatus: translations?.doneStatus ?? 'Done',
      closed: translations?.closed ?? 'Closed',
      documents: translations?.documents ?? 'Documents',
      // Common
      task: translations?.task ?? 'task',
      tasks: translations?.tasks ?? 'tasks',
      changeColor: translations?.changeColor ?? 'Change Color',
      deleteList: translations?.deleteList ?? 'Delete List',
      gray: translations?.gray ?? 'Gray',
      red: translations?.red ?? 'Red',
      blue: translations?.blue ?? 'Blue',
      green: translations?.green ?? 'Green',
      yellow: translations?.yellow ?? 'Yellow',
      orange: translations?.orange ?? 'Orange',
      purple: translations?.purple ?? 'Purple',
      pink: translations?.pink ?? 'Pink',
      indigo: translations?.indigo ?? 'Indigo',
      cyan: translations?.cyan ?? 'Cyan',
    }),
    [translations]
  );

  const statusLabels: Record<TaskBoardStatus, string> = useMemo(
    () => ({
      not_started: t.backlog,
      active: t.active,
      done: t.doneStatus,
      closed: t.closed,
      documents: t.documents,
    }),
    [t]
  );
  const queryClient = useQueryClient();
  const colorOptions = useMemo(
    () => [
      {
        value: 'GRAY' as SupportedColor,
        label: t.gray,
        class: 'bg-dynamic-gray/30',
      },
      {
        value: 'RED' as SupportedColor,
        label: t.red,
        class: 'bg-dynamic-red/30',
      },
      {
        value: 'BLUE' as SupportedColor,
        label: t.blue,
        class: 'bg-dynamic-blue/30',
      },
      {
        value: 'GREEN' as SupportedColor,
        label: t.green,
        class: 'bg-dynamic-green/30',
      },
      {
        value: 'YELLOW' as SupportedColor,
        label: t.yellow,
        class: 'bg-dynamic-yellow/30',
      },
      {
        value: 'ORANGE' as SupportedColor,
        label: t.orange,
        class: 'bg-dynamic-orange/30',
      },
      {
        value: 'PURPLE' as SupportedColor,
        label: t.purple,
        class: 'bg-dynamic-purple/30',
      },
      {
        value: 'PINK' as SupportedColor,
        label: t.pink,
        class: 'bg-dynamic-pink/30',
      },
      {
        value: 'INDIGO' as SupportedColor,
        label: t.indigo,
        class: 'bg-dynamic-indigo/30',
      },
      {
        value: 'CYAN' as SupportedColor,
        label: t.cyan,
        class: 'bg-dynamic-cyan/30',
      },
    ],
    [t]
  );
  const supabase = createClient();

  const [editingList, setEditingList] = useState<WorkspaceTaskList | null>(
    null
  );
  const [deletingList, setDeletingList] = useState<WorkspaceTaskList | null>(
    null
  );
  const [creatingList, setCreatingList] = useState(false);

  // Broadcast for realtime sync with other clients
  const contextBroadcast = useBoardBroadcast();
  const broadcast = contextBroadcast ?? getActiveBroadcast();

  // Group lists by status
  const groupedLists = lists.reduce(
    (acc, list) => {
      if (!list.status) return acc;
      if (!acc[list.status]) {
        acc[list.status] = [];
      }
      acc[list.status].push(list);
      return acc;
    },
    {} as Record<TaskBoardStatus, WorkspaceTaskList[]>
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
      updates: Partial<WorkspaceTaskList>;
    }) => {
      const { error } = await supabase
        .from('task_lists')
        .update(updates)
        .eq('id', listId);

      if (error) throw error;
    },
    onMutate: async ({ listId, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['task_lists', boardId] });
      const previous = queryClient.getQueryData<WorkspaceTaskList[]>([
        'task_lists',
        boardId,
      ]);
      queryClient.setQueryData(
        ['task_lists', boardId],
        (old: WorkspaceTaskList[] | undefined) => {
          if (!old) return old;
          return old.map((l) => (l.id === listId ? { ...l, ...updates } : l));
        }
      );
      return { previous };
    },
    onSuccess: (_, { listId, updates }) => {
      toast.success(t.listUpdatedSuccessfully);
      broadcast?.('list:upsert', { list: { id: listId, ...updates } });
      setEditingList(null);
      onUpdate();
    },
    onError: (error: unknown, _, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['task_lists', boardId], context.previous);
      }
      toast.error(
        error instanceof Error ? error.message : t.failedToUpdateList
      );
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
    onMutate: async ({ listId, color }) => {
      await queryClient.cancelQueries({ queryKey: ['task_lists', boardId] });
      const previous = queryClient.getQueryData<WorkspaceTaskList[]>([
        'task_lists',
        boardId,
      ]);
      queryClient.setQueryData(
        ['task_lists', boardId],
        (old: WorkspaceTaskList[] | undefined) => {
          if (!old) return old;
          return old.map((l) => (l.id === listId ? { ...l, color } : l));
        }
      );
      return { previous };
    },
    onSuccess: (_, { listId, color }) => {
      toast.success(t.colorUpdated);
      broadcast?.('list:upsert', { list: { id: listId, color } });
      onUpdate();
    },
    onError: (error: unknown, _, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['task_lists', boardId], context.previous);
      }
      toast.error(
        error instanceof Error ? error.message : t.failedToUpdateColor
      );
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
      toast.success(t.listDeletedSuccessfully);
      queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      setDeletingList(null);
      onUpdate();
    },
    onError: (error: any) => {
      toast.error(error.message || t.failedToDeleteList);
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
        toast.error(t.cannotMoveToClosedStatus);
        return;
      }

      // Store snapshot for rollback
      const previousLists = queryClient.getQueryData<WorkspaceTaskList[]>([
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
          (oldData: WorkspaceTaskList[] | undefined) => {
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
          toast.success(t.listsReordered);
        } catch (error) {
          console.error('Failed to reorder lists:', error);
          toast.error(t.failedToReorderLists);
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
          (a, b) => (a?.position || 0) - (b?.position || 0)
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
          (oldData: WorkspaceTaskList[] | undefined) => {
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
              status: targetStatus || null,
              position: newPosition,
            })
            .eq('id', draggedList.id);

          if (error) throw error;
          toast.success(
            t.movedToStatus.replace('{status}', statusLabels[targetStatus])
          );
        } catch (error) {
          console.error('Failed to move list:', error);
          toast.error(t.failedToUpdateList);
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
    [boardId, groupedLists, lists, queryClient, statusLabels, supabase, t]
  );

  const handleColorChange = (listId: string, color: SupportedColor) => {
    updateColorMutation.mutate({ listId, color });
  };

  const statuses: TaskBoardStatus[] = [
    'documents',
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
            <DialogTitle>{t.boardLayoutSettings}</DialogTitle>
            <DialogDescription>
              {t.boardLayoutSettingsDescription}
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
              {t.addNewList}
            </Button>

            {/* Lists by Status */}
            <ScrollArea className="h-125 pr-4">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <div className="space-y-6">
                  {statuses.map((status) => {
                    const StatusIcon = statusConfig[status].icon;
                    const statusLists = (groupedLists[status] || []).sort(
                      (a, b) => (a?.position || 0) - (b?.position || 0)
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
                            {statusLabels[status]}
                          </h3>
                          <Badge variant="secondary" className="text-[10px]">
                            {statusLists.length}
                          </Badge>
                        </div>

                        {statusLists.length === 0 ? (
                          <div className="rounded-lg border-2 border-dashed p-4 text-center">
                            <p className="text-muted-foreground text-sm">
                              {t.noListsInStatus}
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
                                  translations={{
                                    task: t.task,
                                    tasks: t.tasks,
                                    changeColor: t.changeColor,
                                    editList: t.editList,
                                    deleteList: t.deleteList,
                                    backlog: t.backlog,
                                    active: t.active,
                                    doneStatus: t.doneStatus,
                                    closed: t.closed,
                                    documents: t.documents,
                                    gray: t.gray,
                                    red: t.red,
                                    blue: t.blue,
                                    green: t.green,
                                    yellow: t.yellow,
                                    orange: t.orange,
                                    purple: t.purple,
                                    pink: t.pink,
                                    indigo: t.indigo,
                                    cyan: t.cyan,
                                  }}
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
              {t.done}
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
          <DialogContent className="sm:max-w-106.25">
            <DialogHeader>
              <DialogTitle>{t.editList}</DialogTitle>
              <DialogDescription>{t.updateListDescription}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">{t.listName}</Label>
                <Input
                  defaultValue={editingList?.name || ''}
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
                <Label htmlFor="edit-status">{t.statusCategory}</Label>
                <Select
                  defaultValue={editingList?.status || ''}
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
                            {statusLabels[status]}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t.color}</Label>
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
                {t.cancel}
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
                {updateListMutation.isPending ? t.saving : t.saveChanges}
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
            <AlertDialogTitle>{t.deleteListTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.deleteListDescription.replace(
                '{name}',
                deletingList?.name || ''
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteListMutation.isPending}>
              {t.cancel}
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
              {deleteListMutation.isPending ? t.saving : t.deleteListConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
