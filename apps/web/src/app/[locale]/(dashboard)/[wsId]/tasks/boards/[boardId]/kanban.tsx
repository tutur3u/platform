'use client';

import { coordinateGetter } from './keyboard-preset';
import { TaskCard } from './task';
import type { Column } from './task-list';
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
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { type Task as TaskType } from '@tuturuuu/types/primitives/TaskBoard';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  boardId: string;
  tasks: TaskType[];
  isLoading: boolean;
}

export function KanbanBoard({ boardId, tasks, isLoading }: Props) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [activeColumn, setActiveColumn] = useState<Column | null>(null);
  const [activeTask, setActiveTask] = useState<TaskType | null>(null);
  const pickedUpTaskColumn = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const moveTaskMutation = useMoveTask(boardId);

  const handleTaskCreated = () => {
    // Invalidate the tasks query to trigger a refetch
    queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
  };

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    // Initial data fetch and real-time updates for lists
    async function loadLists() {
      try {
        const lists = await getTaskLists(supabase, boardId);
        // Use the full TaskList objects as columns (they extend Column interface)
        const enhancedColumns: Column[] = lists.map((list) => ({
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
        (oldData: TaskType[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.map((t) =>
            t.id === activeTask.id ? { ...t, list_id: targetListId } : t
          );
        }
      );
    }
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    setActiveColumn(null);
    setActiveTask(null);

    if (!over) {
      // Reset the cache if dropped outside
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      pickedUpTaskColumn.current = null;
      return;
    }

    const activeType = active.data?.current?.type;
    if (!activeType) {
      pickedUpTaskColumn.current = null;
      return;
    }

    if (activeType === 'Task') {
      const activeTask = active.data?.current?.task;
      if (!activeTask) {
        pickedUpTaskColumn.current = null;
        return;
      }

      let targetListId: string;
      if (over.data?.current?.type === 'Column') {
        targetListId = String(over.id);
      } else if (over.data?.current?.type === 'Task') {
        targetListId = String(over.data.current.task.list_id);
      } else {
        pickedUpTaskColumn.current = null;
        return;
      }

      const originalListId = pickedUpTaskColumn.current;
      if (!originalListId) {
        pickedUpTaskColumn.current = null;
        return;
      }

      const sourceListExists = columns.some(
        (col) => String(col.id) === originalListId
      );
      const targetListExists = columns.some(
        (col) => String(col.id) === targetListId
      );

      if (!sourceListExists || !targetListExists) {
        pickedUpTaskColumn.current = null;
        return;
      }

      // Only move if actually changing lists
      if (targetListId !== originalListId) {
        try {
          // Optimistically update the task in the cache
          queryClient.setQueryData(
            ['tasks', boardId],
            (oldData: TaskType[] | undefined) => {
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
          // Revert the optimistic update by invalidating the query
          queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
          console.error('Failed to move task:', error);
        }
      }
    }

    pickedUpTaskColumn.current = null;
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
          collisionDetection={closestCenter}
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

              // Get viewport bounds (safely handle SSR)
              const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
              const maxX = viewportWidth - 350; // Account for card width

              return {
                ...transform,
                x: Math.min(Math.max(transform.x, -50), maxX), // Constrain X position
              };
            },
          ]}
        >
          <BoardContainer>
            <SortableContext
              items={columnsId}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex h-full gap-4">
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
            {activeColumn && (
              <BoardColumn
                column={activeColumn}
                boardId={boardId}
                tasks={tasks.filter((task) => task.list_id === activeColumn.id)}
                isOverlay
                onTaskCreated={handleTaskCreated}
                onListUpdated={handleTaskCreated}
              />
            )}
            {activeTask && (
              <div className="w-full max-w-[350px]">
                <TaskCard
                  task={activeTask}
                  taskList={columns.find(
                    (col) => col.id === activeTask.list_id
                  )}
                  boardId={boardId}
                  isOverlay
                  onUpdate={handleTaskCreated}
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
