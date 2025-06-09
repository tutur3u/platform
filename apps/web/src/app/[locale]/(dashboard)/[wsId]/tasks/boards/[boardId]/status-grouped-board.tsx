'use client';

import { EnhancedTaskList } from './enhanced-task-list';
import { StatusSection } from './status-section';
import { TaskCard } from './task';
import { useMoveTask } from '@/lib/task-helper';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import {
  Task,
  TaskBoardStatus,
  TaskList,
} from '@tuturuuu/types/primitives/TaskBoard';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { toast } from 'sonner';

interface Props {
  lists: TaskList[];
  tasks: Task[];
  boardId: string;
  onUpdate: () => void;
  hideTasksMode?: boolean;
}

export function StatusGroupedBoard({
  lists,
  tasks,
  boardId,
  onUpdate,
  hideTasksMode = true,
}: Props) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [activeList, setActiveList] = useState<TaskList | null>(null);
  const queryClient = useQueryClient();
  const supabase = createClient();

  // Enhanced sensors for better drag experience
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(MouseSensor, {
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
      toast.success('List moved successfully');
      onUpdate();
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

    // Task over Task (within list)
    if (activeType === 'Task' && overType === 'Task') {
      const activeTask = active.data?.current?.task;
      const overTask = over.data?.current?.task;

      if (activeTask && overTask && activeTask.list_id !== overTask.list_id) {
        // Optimistically update for preview
        queryClient.setQueryData(
          ['tasks', boardId],
          (oldData: Task[] | undefined) => {
            if (!oldData) return oldData;
            return oldData.map((t) =>
              t.id === activeTask.id ? { ...t, list_id: overTask.list_id } : t
            );
          }
        );
      }
    }

    // Task over List
    if (activeType === 'Task' && overType === 'List') {
      const activeTask = active.data?.current?.task;
      const overList = over.data?.current?.list;

      if (activeTask && overList && activeTask.list_id !== overList.id) {
        queryClient.setQueryData(
          ['tasks', boardId],
          (oldData: Task[] | undefined) => {
            if (!oldData) return oldData;
            return oldData.map((t) =>
              t.id === activeTask.id ? { ...t, list_id: overList.id } : t
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
      // Reset optimistic updates
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
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

      if (overType === 'Status') {
        targetStatus = over.data?.current?.status;
      } else if (overType === 'List') {
        const overList = over.data?.current?.list;
        targetStatus = overList?.status;
      }

      if (activeList && targetStatus && activeList.status !== targetStatus) {
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

        // Calculate new position (append to end of status group)
        const targetStatusLists = groupedLists[targetStatus] || [];
        const newPosition =
          Math.max(0, ...targetStatusLists.map((l) => l.position || 0)) + 1;

        moveListMutation.mutate({
          listId: activeList.id,
          newStatus: targetStatus,
          newPosition,
        });
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
    <div className="h-full w-full">
      {hideTasksMode && (
        <div className="mb-4 border-b pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-dynamic-blue/20 p-2">
                <svg
                  className="h-5 w-5 text-dynamic-blue/80"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Board Structure View
                </h2>
                <p className="text-sm text-muted-foreground">
                  Viewing task lists and organization without individual tasks
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="rounded-full bg-dynamic-gray/20 px-3 py-1">
                {lists.length} lists
              </span>
              <span className="rounded-full bg-dynamic-purple/20 px-3 py-1">
                {tasks.length} tasks (hidden)
              </span>
            </div>
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div
          className={cn(
            'grid h-full grid-cols-1 gap-4 overflow-y-auto lg:grid-cols-2 xl:grid-cols-4',
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
            <div className="rotate-2 opacity-95">
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
            <div className="rotate-1 opacity-95">
              <EnhancedTaskList
                list={activeList}
                tasks={tasksByList[activeList.id] || []}
                boardId={boardId}
                isOverlay
                onUpdate={onUpdate}
                hideTasksMode={hideTasksMode}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
