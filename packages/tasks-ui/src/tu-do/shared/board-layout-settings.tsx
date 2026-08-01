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
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateWorkspaceTaskList } from '@tuturuuu/internal-api/tasks';
import type { WorkspaceTaskList } from '@tuturuuu/types';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import { Accordion } from '@tuturuuu/ui/accordion';
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
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getActiveBroadcast,
  useBoardBroadcast,
} from './board-broadcast-context';
import type { BoardLayoutListItemCopy } from './board-layout-list-item';
import { reorderTaskLists } from './board-layout-ordering';
import { BOARD_LIST_STATUSES } from './board-layout-settings-config';
import { BoardLayoutStatusGroup } from './board-layout-status-group';
import { CreateListDialog } from './create-list-dialog';
import { EditListDialog } from './edit-list-dialog';
import { isTaskListNameExistsError } from './task-board-errors';

interface BoardLayoutSettingsContentProps {
  boardId: string;
  wsId?: string;
  lists: WorkspaceTaskList[];
  onUpdate: () => Promise<void> | void;
  disableScrollArea?: boolean;
  scrollAreaClassName?: string;
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
    listNameAlreadyExists?: string;
    colorUpdated?: string;
    failedToUpdateColor?: string;
    listDeletedSuccessfully?: string;
    failedToDeleteList?: string;
    cannotReorderAcrossStatuses?: string;
    listsReordered?: string;
    failedToReorderLists?: string;
    movedToStatus?: string;
    // Status labels
    backlog?: string;
    active?: string;
    review?: string;
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

interface BoardLayoutSettingsProps extends BoardLayoutSettingsContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BoardLayoutSettingsContent({
  boardId,
  wsId,
  lists,
  onUpdate,
  disableScrollArea = false,
  scrollAreaClassName,
  translations,
}: BoardLayoutSettingsContentProps) {
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
      listNameAlreadyExists:
        translations?.listNameAlreadyExists ??
        'A list with this name already exists on this board',
      colorUpdated: translations?.colorUpdated ?? 'Color updated',
      failedToUpdateColor:
        translations?.failedToUpdateColor ?? 'Failed to update color',
      listDeletedSuccessfully:
        translations?.listDeletedSuccessfully ?? 'List deleted successfully',
      failedToDeleteList:
        translations?.failedToDeleteList ?? 'Failed to delete list',
      cannotReorderAcrossStatuses:
        translations?.cannotReorderAcrossStatuses ??
        'Task lists can only be reordered within the same status group',
      listsReordered: translations?.listsReordered ?? 'Lists reordered',
      failedToReorderLists:
        translations?.failedToReorderLists ?? 'Failed to reorder lists',
      movedToStatus: translations?.movedToStatus ?? 'Moved to {status}',
      // Status labels
      backlog: translations?.backlog ?? 'Backlog',
      active: translations?.active ?? 'Active',
      review: translations?.review ?? 'Review',
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
      review: t.review,
      done: t.doneStatus,
      closed: t.closed,
      documents: t.documents,
    }),
    [t]
  );
  const queryClient = useQueryClient();
  const [editingList, setEditingList] = useState<WorkspaceTaskList | null>(
    null
  );
  const [deletingList, setDeletingList] = useState<WorkspaceTaskList | null>(
    null
  );
  const [creatingList, setCreatingList] = useState(false);
  const [createListStatus, setCreateListStatus] =
    useState<TaskBoardStatus>('active');
  const [visibleLists, setVisibleLists] = useState(lists);

  useEffect(() => {
    setVisibleLists(lists);
  }, [lists]);

  // Broadcast for realtime sync with other clients
  const contextBroadcast = useBoardBroadcast();
  const broadcast = contextBroadcast ?? getActiveBroadcast();

  // Group lists by status
  const groupedLists = visibleLists.reduce(
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
      if (!wsId) throw new Error('Workspace ID is required');
      await updateWorkspaceTaskList(wsId, boardId, listId, {
        name: updates.name ?? undefined,
        status: updates.status ?? undefined,
        color: (updates.color as SupportedColor | undefined) ?? undefined,
        position: updates.position ?? undefined,
        deleted: updates.deleted ?? undefined,
      });
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
        isTaskListNameExistsError(error)
          ? t.listNameAlreadyExists
          : error instanceof Error
            ? error.message
            : t.failedToUpdateList
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
      if (!wsId) throw new Error('Workspace ID is required');
      await updateWorkspaceTaskList(wsId, boardId, listId, { color });
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
      if (!wsId) throw new Error('Workspace ID is required');
      await updateWorkspaceTaskList(wsId, boardId, listId, { deleted: true });
    },
    onMutate: async (listId) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['task_lists', boardId] }),
        queryClient.cancelQueries({ queryKey: ['tasks', boardId] }),
      ]);

      const previousLists = queryClient.getQueryData<WorkspaceTaskList[]>([
        'task_lists',
        boardId,
      ]);
      const previousTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        boardId,
      ]);

      queryClient.setQueryData(
        ['task_lists', boardId],
        (old: WorkspaceTaskList[] | undefined) => {
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
    onSuccess: (_, listId) => {
      toast.success(t.listDeletedSuccessfully);
      broadcast?.('list:delete', { listId });
      setDeletingList(null);
      onUpdate();
    },
    onError: (error: any, _, context) => {
      if (context?.previousLists) {
        queryClient.setQueryData(
          ['task_lists', boardId],
          context.previousLists
        );
      }
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      toast.error(error.message || t.failedToDeleteList);
    },
  });

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) return;

      // Find the dragged list
      const draggedList = visibleLists.find((l) => l.id === active.id);
      if (!draggedList) return;

      const overId = String(over.id);
      const targetStatus = overId.startsWith('status:')
        ? (overId.slice('status:'.length) as TaskBoardStatus)
        : (visibleLists.find((list) => list.id === overId)?.status ?? null);

      if (!targetStatus) return;

      const previousLists = visibleLists;
      const reordered = reorderTaskLists(
        visibleLists,
        String(active.id),
        overId
      );
      if (!reordered) return;

      setVisibleLists(reordered.lists);
      queryClient.setQueryData(
        ['task_lists', boardId],
        (oldData: WorkspaceTaskList[] | undefined) => {
          if (!oldData) return oldData;
          const updatesById = new Map(
            reordered.updates.map((update) => [update.id, update])
          );
          return oldData.map((list) => {
            const update = updatesById.get(list.id);
            return update === undefined ? list : { ...list, ...update };
          });
        }
      );

      try {
        if (!wsId) throw new Error('Workspace ID is required');
        await Promise.all(
          reordered.updates.map(({ id, position, status }) =>
            updateWorkspaceTaskList(wsId, boardId, id, { position, status })
          )
        );

        for (const update of reordered.updates) {
          broadcast?.('list:upsert', { list: update });
        }
        await onUpdate();
        toast.success(
          draggedList.status === targetStatus
            ? t.listsReordered
            : t.movedToStatus.replace('{status}', statusLabels[targetStatus])
        );
      } catch (error) {
        console.error('Failed to reorder lists:', error);
        toast.error(t.failedToReorderLists);
        setVisibleLists(previousLists);
        queryClient.setQueryData(['task_lists', boardId], previousLists);
      }
    },
    [
      boardId,
      broadcast,
      onUpdate,
      queryClient,
      statusLabels,
      t,
      visibleLists,
      wsId,
    ]
  );

  const handleColorChange = (listId: string, color: SupportedColor) => {
    updateColorMutation.mutate({ listId, color });
  };

  const openCreateListDialog = useCallback((status: TaskBoardStatus) => {
    setCreateListStatus(status);
    setCreatingList(true);
  }, []);

  const listGroups = (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <Accordion
        className="space-y-3"
        defaultValue={BOARD_LIST_STATUSES}
        type="multiple"
      >
        {BOARD_LIST_STATUSES.map((status) => {
          const statusLists = [...(groupedLists[status] || [])].sort(
            (a, b) => (a?.position || 0) - (b?.position || 0)
          );
          const itemCopy: BoardLayoutListItemCopy = {
            active: t.active,
            backlog: t.backlog,
            blue: t.blue,
            changeColor: t.changeColor,
            closed: t.closed,
            cyan: t.cyan,
            deleteList: t.deleteList,
            documents: t.documents,
            doneStatus: t.doneStatus,
            editList: t.editList,
            gray: t.gray,
            green: t.green,
            indigo: t.indigo,
            orange: t.orange,
            pink: t.pink,
            purple: t.purple,
            red: t.red,
            review: t.review,
            yellow: t.yellow,
          };

          return (
            <BoardLayoutStatusGroup
              addNewList={t.addNewList}
              copy={itemCopy}
              key={status}
              label={statusLabels[status]}
              lists={statusLists}
              noListsInStatus={t.noListsInStatus}
              onAdd={openCreateListDialog}
              onColorChange={handleColorChange}
              onDelete={setDeletingList}
              onEdit={setEditingList}
              status={status}
            />
          );
        })}
      </Accordion>
    </DndContext>
  );

  return (
    <>
      <div className="space-y-6">
        {/* Lists by Status */}
        {disableScrollArea ? (
          <div className={scrollAreaClassName}>{listGroups}</div>
        ) : (
          <ScrollArea className={cn('h-125 pr-4', scrollAreaClassName)}>
            {listGroups}
          </ScrollArea>
        )}
      </div>

      {/* Create List Dialog */}
      <CreateListDialog
        open={creatingList}
        onOpenChange={setCreatingList}
        boardId={boardId}
        wsId={wsId}
        initialStatus={createListStatus}
        onSuccess={() => {
          onUpdate();
        }}
        translations={{
          listNameAlreadyExists: t.listNameAlreadyExists,
        }}
      />

      <EditListDialog
        open={!!editingList}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEditingList(null);
          }
        }}
        list={
          editingList
            ? {
                id: editingList.id,
                name: editingList.name ?? '',
                status: editingList.status,
                color: (editingList.color as SupportedColor | null) ?? null,
              }
            : null
        }
        isSaving={updateListMutation.isPending}
        onSave={({ listId, updates }) => {
          updateListMutation.mutate({ listId, updates });
        }}
      />

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

export function BoardLayoutSettings({
  open,
  onOpenChange,
  translations,
  ...contentProps
}: BoardLayoutSettingsProps) {
  const title = translations?.boardLayoutSettings ?? 'Board Layout Settings';
  const description =
    translations?.boardLayoutSettingsDescription ??
    'Manage your board columns and organize them by status. Drag to reorder within each status group.';
  const done = translations?.done ?? 'Done';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <BoardLayoutSettingsContent
          {...contentProps}
          scrollAreaClassName="h-125 pr-4"
          translations={translations}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {done}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
