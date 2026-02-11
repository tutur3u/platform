'use client';

import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useMoveTask } from '@tuturuuu/utils/task-helper';
import { useState } from 'react';
import { useBoardBroadcast } from '../../shared/board-broadcast-context';
import { EnhancedTaskList } from './enhanced-task-list';
import { StatusSection } from './status-section';
import { TaskCard } from './task';

// Prefer pointerWithin for precise targeting; fall back to closestCenter
const statusBoardCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return closestCenter(args);
};

interface Props {
  lists: TaskList[];
  tasks: Task[];
  boardId: string;
  onUpdate: () => void;
  hideTasksMode?: boolean;
  isPersonalWorkspace?: boolean;
}

export function StatusGroupedBoard({
  lists,
  tasks,
  boardId,
  onUpdate,
  hideTasksMode = true,
  isPersonalWorkspace,
}: Props) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeList, setActiveList] = useState<TaskList | null>(null);
  const queryClient = useQueryClient();
  const supabase = createClient();

  // PointerSensor handles both mouse + pointer events; MouseSensor is redundant
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

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

  // Group tasks by list
  const tasksByList = tasks.reduce(
    (acc, task) => {
      if (!acc[task.list_id]) {
        acc[task.list_id] = [];
      }
      acc[task.list_id]?.push(task);
      return acc;
    },
    {} as Record<string, Task[]>
  );

  const broadcast = useBoardBroadcast();

  // Move task mutation using the helper function with auto-completion logic
  const moveTaskMutation = useMoveTask(boardId);

  // Move list mutation
  const moveListMutation = useMutation({
    mutationFn: async ({
      listId,
      newStatus,
      newPosition,
    }: {
      listId: string;
      newStatus: TaskBoardStatus;
      newPosition: number;
    }) => {
      const { error } = await supabase
        .from('task_lists')
        .update({
          status: newStatus,
          position: newPosition,
        })
        .eq('id', listId);

      if (error) throw error;
      return { listId, newStatus, newPosition };
    },
    onError: (error) => {
      console.error('Failed to move list:', error);
      toast.error('Failed to move list');
      queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
    },
  });

  function onDragStart(event: DragStartEvent) {
    const { active } = event;
    const { type, task, list } = active.data?.current || {};

    console.log('🎯 Drag started:', {
      type,
      taskId: task?.id,
      listId: list?.id,
    });

    if (type === 'Task' && task) {
      setActiveTask(task);
    } else if (type === 'List' && list) {
      setActiveList(list);
    }
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeType = active.data?.current?.type;
    const overType = over.data?.current?.type;

    console.log('🔄 Drag over:', {
      activeType,
      overType,
      activeId: active.id,
      overId: over.id,
      overData: over.data?.current,
    });

    // Only apply optimistic updates for task movements
    if (activeType === 'Task') {
      const activeTask = active.data?.current?.task;
      if (!activeTask) return;

      let targetListId: string | null = null;

      // Task over Task
      if (overType === 'Task') {
        const overTask = over.data?.current?.task;
        targetListId = overTask?.list_id;
      }
      // Task over List
      else if (overType === 'List') {
        const overList = over.data?.current?.list;
        targetListId = overList?.id;
      }
      // Task over Status section
      else if (overType === 'Status') {
        const status = over.data?.current?.status;
        if (status && typeof status === 'string') {
          const statusLists = groupedLists[status as TaskBoardStatus] || [];
          targetListId = statusLists[0]?.id || null;
        }
      }

      // Apply optimistic update if target is different from current
      if (targetListId && activeTask.list_id !== targetListId) {
        queryClient.setQueryData(
          ['tasks', boardId],
          (oldData: Task[] | undefined) => {
            if (!oldData) return oldData;
            return oldData.map((t) =>
              t.id === activeTask.id ? { ...t, list_id: targetListId } : t
            );
          }
        );
      }
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    setActiveList(null);

    if (!over) {
      // No valid drop target - no action needed
      // Note: We intentionally do NOT invalidate queries here.
      // If there was no drop target, no mutation occurred.
      return;
    }

    const activeType = active.data?.current?.type;
    const overType = over.data?.current?.type;

    // Handle task drops
    if (activeType === 'Task') {
      const activeTask = active.data?.current?.task;
      let targetListId: string | null = null;

      if (overType === 'Task') {
        const overTask = over.data?.current?.task;
        targetListId = overTask?.list_id;
      } else if (overType === 'List') {
        const overList = over.data?.current?.list;
        targetListId = overList?.id;
      } else if (overType === 'Status') {
        // Find the first available list in this status
        const status = over.data?.current?.status;
        if (status && typeof status === 'string') {
          const statusLists = groupedLists[status as TaskBoardStatus] || [];
          if (statusLists.length > 0 && statusLists[0]?.id) {
            targetListId = statusLists[0].id;
          }
        }
      }

      if (activeTask && targetListId && activeTask.list_id !== targetListId) {
        console.log('🔄 Moving task:', {
          taskId: activeTask.id,
          newListId: targetListId,
          fromList: activeTask.list_id,
          mutationState: moveTaskMutation.status,
        });

        moveTaskMutation.mutate(
          {
            taskId: activeTask.id,
            newListId: targetListId,
          },
          {
            onSuccess: (data) => {
              console.log('✅ Task moved successfully:', data);
              toast.success('Task moved successfully');
              broadcast?.('task:upsert', {
                task: {
                  id: data.id,
                  list_id: data.list_id,
                  completed_at: data.completed_at,
                  closed_at: data.closed_at,
                },
              });
            },
            onError: (error) => {
              console.error('❌ Failed to move task:', error);
              toast.error('Failed to move task');
              // Reset optimistic updates
              queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
            },
          }
        );
      } else {
        console.log('Task movement skipped:', {
          hasActiveTask: !!activeTask,
          hasTargetListId: !!targetListId,
          isSameList: activeTask?.list_id === targetListId,
          activeTaskListId: activeTask?.list_id,
          targetListId,
        });
      }
    }

    // Handle list drops
    if (activeType === 'List') {
      const activeList = active.data?.current?.list;
      let targetStatus: TaskBoardStatus | null = null;
      let insertBeforeList: TaskList | null = null;

      if (overType === 'Status') {
        targetStatus = over.data?.current?.status;
      } else if (overType === 'List') {
        const overList = over.data?.current?.list;
        targetStatus = overList?.status;
        insertBeforeList = overList;
      }

      if (activeList && targetStatus) {
        // Same status reordering
        if (activeList.status === targetStatus && insertBeforeList) {
          const statusLists = (groupedLists[targetStatus] || [])
            .filter((l) => l.id !== activeList.id)
            .sort((a, b) => a.position - b.position);

          const insertIndex = statusLists.findIndex(
            (l) => l.id === insertBeforeList?.id
          );

          if (insertIndex !== -1) {
            // Reorder within same status
            statusLists.splice(insertIndex, 0, activeList);

            // Store snapshot for rollback
            const previousLists = queryClient.getQueryData<TaskList[]>([
              'task_lists',
              boardId,
            ]);

            // Update positions for all lists in this status
            const updates = statusLists.map((list, index) => ({
              listId: list.id,
              newStatus: targetStatus,
              newPosition: index,
            }));

            // Optimistically update cache (no invalidation)
            queryClient.setQueryData(
              ['task_lists', boardId],
              (oldData: TaskList[] | undefined) => {
                if (!oldData) return oldData;
                return oldData.map((list) => {
                  const update = updates.find((u) => u.listId === list.id);
                  return update
                    ? {
                        ...list,
                        status: update.newStatus,
                        position: update.newPosition,
                      }
                    : list;
                });
              }
            );

            // Persist all position changes in background
            Promise.allSettled(
              updates.map((update) => moveListMutation.mutateAsync(update))
            ).then((results) => {
              const hasErrors = results.some((r) => r.status === 'rejected');
              if (hasErrors) {
                console.error('Failed to persist list reordering');
                if (previousLists) {
                  queryClient.setQueryData(
                    ['task_lists', boardId],
                    previousLists
                  );
                } else {
                  queryClient.invalidateQueries({
                    queryKey: ['task_lists', boardId],
                  });
                }
              } else {
                // Success - show toast
                toast.success('List reordered');
              }
            });
            return;
          }
        }

        // Different status movement
        if (activeList.status !== targetStatus) {
          // Check business rules for closed status - prevent moving to/from closed
          if (
            (targetStatus as string) === 'closed' ||
            (activeList.status as string) === 'closed'
          ) {
            toast.error('Cannot move lists to or from closed status');
            queryClient.invalidateQueries({
              queryKey: ['task_lists', boardId],
            });
            return;
          }

          // Additional check: only one closed list allowed
          if (targetStatus === 'closed') {
            const existingClosedLists = groupedLists.closed || [];
            if (existingClosedLists.length >= 1) {
              toast.error('Only one closed list allowed per board');
              queryClient.invalidateQueries({
                queryKey: ['task_lists', boardId],
              });
              return;
            }
          }

          // Calculate new position
          let newPosition: number;
          if (insertBeforeList) {
            // Insert before specific list
            const targetStatusLists = (groupedLists[targetStatus] || []).sort(
              (a, b) => a.position - b.position
            );
            const insertIndex = targetStatusLists.findIndex(
              (l) => l.id === insertBeforeList?.id
            );
            newPosition =
              insertIndex > 0
                ? (targetStatusLists[insertIndex - 1]?.position ||
                    0 + (targetStatusLists[insertIndex]?.position || 0)) / 2
                : (targetStatusLists[0]?.position || 0) - 1;
          } else {
            // Append to end of status group
            const targetStatusLists = groupedLists[targetStatus] || [];
            newPosition =
              Math.max(0, ...targetStatusLists.map((l) => l.position || 0)) + 1;
          }

          // Store snapshot for rollback
          const previousLists = queryClient.getQueryData<TaskList[]>([
            'task_lists',
            boardId,
          ]);

          // Optimistically update cache
          queryClient.setQueryData(
            ['task_lists', boardId],
            (oldData: TaskList[] | undefined) => {
              if (!oldData) return oldData;
              return oldData.map((list) =>
                list.id === activeList.id
                  ? { ...list, status: targetStatus, position: newPosition }
                  : list
              );
            }
          );

          // Persist to database
          moveListMutation.mutate(
            {
              listId: activeList.id,
              newStatus: targetStatus,
              newPosition,
            },
            {
              onSuccess: () => {
                toast.success('List moved successfully');
              },
              onError: () => {
                // Rollback on error
                if (previousLists) {
                  queryClient.setQueryData(
                    ['task_lists', boardId],
                    previousLists
                  );
                }
              },
            }
          );
        }
      }
    }
  }

  const statuses: TaskBoardStatus[] = [
    'not_started',
    'active',
    'done',
    'closed',
  ];

  return (
    <div className="h-full w-full p-2">
      <DndContext
        sensors={sensors}
        collisionDetection={statusBoardCollisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div
          className={cn(
            'grid h-full grid-cols-1 gap-3 overflow-y-auto pb-4 lg:grid-cols-2 xl:grid-cols-4',
            hideTasksMode && 'pt-0'
          )}
        >
          {statuses.map((status) => {
            const statusLists = groupedLists[status] || [];
            return (
              <SortableContext
                key={status}
                items={statusLists.map((l) => l.id)}
                strategy={verticalListSortingStrategy}
              >
                <StatusSection
                  status={status}
                  lists={statusLists}
                  tasksByList={hideTasksMode ? {} : tasksByList}
                  boardId={boardId}
                  onUpdate={onUpdate}
                  hideTasksMode={hideTasksMode}
                />
              </SortableContext>
            );
          })}
        </div>

        <DragOverlay>
          {activeTask && (
            <div className="rotate-2 scale-105 opacity-95 shadow-2xl transition-all">
              <TaskCard
                task={activeTask}
                taskList={lists.find((l) => l.id === activeTask.list_id)}
                boardId={boardId}
                isOverlay
                onUpdate={() => {}}
              />
            </div>
          )}
          {activeList && (
            <div className="rotate-1 scale-105 opacity-95 shadow-2xl transition-all">
              <EnhancedTaskList
                list={activeList}
                tasks={tasksByList[activeList.id] || []}
                boardId={boardId}
                isOverlay
                onUpdate={onUpdate}
                hideTasksMode={hideTasksMode}
                isPersonalWorkspace={isPersonalWorkspace}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
