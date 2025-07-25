'use client';

import { coordinateGetter } from './keyboard-preset';
import { LightweightTaskCard } from './task';
import { BoardColumn, BoardContainer } from './task-list';
import { TaskListForm } from './task-list-form';
import { hasDraggableData } from './utils';
import { getTaskLists, useMoveTask } from '@/lib/task-helper';
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task, TaskList } from '@tuturuuu/types/primitives/TaskBoard';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  boardId: string;
  tasks: Task[];
  isLoading: boolean;
}

export function KanbanBoard({ boardId, tasks, isLoading }: Props) {
  const [columns, setColumns] = useState<TaskList[]>([]);
  const [activeColumn, setActiveColumn] = useState<TaskList | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const pickedUpTaskColumn = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const moveTaskMutation = useMoveTask(boardId);
  // Ref for the Kanban board container
  const boardRef = useRef<HTMLDivElement>(null);
  const dragStartCardLeft = useRef<number | null>(null);
  const overlayWidth = 350; // Column width

  const handleTaskCreated = useCallback(() => {
    // Invalidate the tasks query to trigger a refetch
    queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
  }, [queryClient, boardId]);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    // Initial data fetch and real-time updates for lists
    async function loadLists() {
      try {
        const lists = await getTaskLists(supabase, boardId);
        // Use the full TaskList objects as columns (they extend Column interface)
        const enhancedColumns: TaskList[] = lists.map((list) => ({
          ...list,
          title: list.name, // Maintain backward compatibility for title property
        }));

        if (mounted) {
          setColumns(enhancedColumns);
        }
      } catch (error) {
        console.error('Failed to load lists:', error);
      }
    }

    // Set up real-time subscription for lists
    const listsSubscription = supabase
      .channel('lists-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_lists',
        },
        loadLists
      )
      .subscribe();

    loadLists();

    return () => {
      mounted = false;
      listsSubscription.unsubscribe();
    };
  }, [boardId]);

  // Global drag state reset on mouseup/touchend
  useEffect(() => {
    function handleGlobalPointerUp() {
      setActiveColumn(null);
      setActiveTask(null);
      pickedUpTaskColumn.current = null;
    }
    window.addEventListener('mouseup', handleGlobalPointerUp);
    window.addEventListener('touchend', handleGlobalPointerUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalPointerUp);
      window.removeEventListener('touchend', handleGlobalPointerUp);
    };
  }, []);

  const columnsId = useMemo(() => columns.map((col) => col.id), [columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: coordinateGetter,
    })
  );

  // Capture drag start card left position
  function onDragStart(event: DragStartEvent) {
    if (!hasDraggableData(event.active)) return;
    const { active } = event;
    if (!active.data?.current) return;

    const { type } = active.data.current;
    if (type === 'Column') {
      setActiveColumn(active.data.current.column);
      return;
    }
    if (type === 'Task') {
      const task = active.data.current.task;
      setActiveTask(task);
      pickedUpTaskColumn.current = String(task.list_id);

      // Use more specific selector for better reliability
      // Prefer data-id selector over generic querySelector
      const cardNode = document.querySelector(
        `[data-id="${task.id}"]`
      ) as HTMLElement;
      if (cardNode) {
        const cardRect = cardNode.getBoundingClientRect();
        dragStartCardLeft.current = cardRect.left;
      } else {
        // Fallback: try to find the card by task ID in a more specific way
        const taskCards = document.querySelectorAll('[data-id]');
        const targetCard = Array.from(taskCards).find(
          (card) => card.getAttribute('data-id') === task.id
        ) as HTMLElement;
        if (targetCard) {
          const cardRect = targetCard.getBoundingClientRect();
          dragStartCardLeft.current = cardRect.left;
        }
      }
      return;
    }
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeType = active.data?.current?.type;
    if (!activeType) return;

    if (activeType === 'Task') {
      const activeTask = active.data?.current?.task;
      if (!activeTask) return;

      let targetListId: string;
      if (over.data?.current?.type === 'Column') {
        targetListId = String(over.id);
      } else if (over.data?.current?.type === 'Task') {
        targetListId = String(over.data.current.task.list_id);
      } else {
        return;
      }

      const originalListId = pickedUpTaskColumn.current;
      if (!originalListId) return;

      const sourceListExists = columns.some(
        (col) => String(col.id) === originalListId
      );
      const targetListExists = columns.some(
        (col) => String(col.id) === targetListId
      );

      if (!sourceListExists || !targetListExists) return;

      // Optimistically update the task in the cache for preview
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

  // Memoized DragOverlay content to minimize re-renders
  const MemoizedTaskOverlay = useMemo(
    () => (activeTask ? <LightweightTaskCard task={activeTask} /> : null),
    [activeTask]
  );
  const MemoizedColumnOverlay = useMemo(
    () =>
      activeColumn ? (
        <BoardColumn
          column={activeColumn}
          boardId={boardId}
          tasks={tasks.filter((task) => task.list_id === activeColumn.id)}
          isOverlay
          onTaskCreated={handleTaskCreated}
          onListUpdated={handleTaskCreated}
        />
      ) : null,
    [activeColumn, tasks, boardId, handleTaskCreated]
  );

  const debugLog = (message: string) => {
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug(`DragEnd: ${message}`);
    }
  };

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    // Always reset drag state, even on invalid drop
    setActiveColumn(null);
    setActiveTask(null);
    pickedUpTaskColumn.current = null;
    dragStartCardLeft.current = null;
    if (!over) {
      // Reset the cache if dropped outside
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      debugLog('No drop target, state reset.');
      return;
    }
    const activeType = active.data?.current?.type;
    if (!activeType) {
      debugLog('No activeType, state reset.');
      return;
    }
    if (activeType === 'Task') {
      const activeTask = active.data?.current?.task;
      if (!activeTask) {
        debugLog('No activeTask, state reset.');
        return;
      }
      let targetListId: string;
      if (over.data?.current?.type === 'Column') {
        targetListId = String(over.id);
      } else if (over.data?.current?.type === 'Task') {
        targetListId = String(over.data.current.task.list_id);
      } else {
        debugLog('Invalid drop type, state reset.');
        return;
      }
      const originalListId =
        event.active.data?.current?.task?.list_id || pickedUpTaskColumn.current;
      if (!originalListId) {
        debugLog('No originalListId, state reset.');
        return;
      }
      const sourceListExists = columns.some(
        (col) => String(col.id) === originalListId
      );
      const targetListExists = columns.some(
        (col) => String(col.id) === targetListId
      );
      if (!sourceListExists || !targetListExists) {
        debugLog('Source or target list missing, state reset.');
        return;
      }
      // Only move if actually changing lists
      if (targetListId !== originalListId) {
        try {
          queryClient.setQueryData(
            ['tasks', boardId],
            (oldData: Task[] | undefined) => {
              if (!oldData) return oldData;
              return oldData.map((t) =>
                t.id === activeTask.id ? { ...t, list_id: targetListId } : t
              );
            }
          );
          moveTaskMutation.mutate({
            taskId: activeTask.id,
            newListId: targetListId,
          });
        } catch (error) {
          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
          if (process.env.NODE_ENV === 'development') {
            // eslint-disable-next-line no-console
            console.error('Failed to move task:', error);
          }
        }
      }
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        {/* Loading skeleton for search bar */}
        <Card className="mb-4 border-dynamic-blue/20 bg-dynamic-blue/5">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative max-w-md flex-1">
                <div className="h-9 w-full animate-pulse rounded-md bg-dynamic-blue/10"></div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-16 animate-pulse rounded-md bg-dynamic-blue/10"></div>
                <div className="h-8 w-20 animate-pulse rounded-md bg-dynamic-blue/10"></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loading skeleton for kanban columns */}
        <div className="flex-1 overflow-hidden">
          <div className="flex h-full gap-4 p-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="h-full w-[350px] animate-pulse">
                <div className="p-4">
                  <div className="mb-4 h-6 w-32 rounded bg-gray-200"></div>
                  <div className="space-y-3">
                    {[1, 2, 3].map((j) => (
                      <div
                        key={j}
                        className="h-24 w-full rounded bg-gray-100"
                      ></div>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Kanban Board */}
      <div className="flex-1 overflow-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          measuring={{
            droppable: {
              strategy: MeasuringStrategy.Always,
            },
          }}
          modifiers={[
            (args) => {
              const { transform } = args;
              if (!boardRef.current || dragStartCardLeft.current === null)
                return transform;
              const boardRect = boardRef.current.getBoundingClientRect();
              // Clamp overlay within board
              const minX = boardRect.left - dragStartCardLeft.current;
              const maxX =
                boardRect.right - dragStartCardLeft.current - overlayWidth;
              return {
                ...transform,
                x: Math.max(minX, Math.min(transform.x, maxX)),
              };
            },
          ]}
        >
          <BoardContainer>
            <SortableContext
              items={columnsId}
              strategy={horizontalListSortingStrategy}
            >
              <div ref={boardRef} className="flex h-full gap-4">
                {columns
                  .sort((a, b) => {
                    // First sort by status priority, then by position within status
                    const statusOrder = {
                      not_started: 0,
                      active: 1,
                      done: 2,
                      closed: 3,
                    };
                    const statusA =
                      statusOrder[a.status as keyof typeof statusOrder] ?? 999;
                    const statusB =
                      statusOrder[b.status as keyof typeof statusOrder] ?? 999;
                    if (statusA !== statusB) return statusA - statusB;
                    return (a.position || 0) - (b.position || 0);
                  })
                  .map((column) => (
                    <BoardColumn
                      key={column.id}
                      column={column}
                      boardId={boardId}
                      tasks={tasks.filter((task) => task.list_id === column.id)}
                      onTaskCreated={handleTaskCreated}
                      onListUpdated={handleTaskCreated}
                    />
                  ))}
                <TaskListForm
                  boardId={boardId}
                  onListCreated={handleTaskCreated}
                />
              </div>
            </SortableContext>
          </BoardContainer>
          <DragOverlay
            wrapperElement="div"
            style={{
              width: 'min(350px, 90vw)',
              maxWidth: '350px',
              pointerEvents: 'none',
            }}
          >
            {MemoizedColumnOverlay}
            {MemoizedTaskOverlay}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
