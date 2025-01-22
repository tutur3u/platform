'use client';

import { coordinateGetter } from './keyboard-preset';
import { TaskCard } from './task';
import type { Column } from './task-list';
import { BoardColumn, BoardContainer } from './task-list';
import { TaskListForm } from './task-list-form';
import { hasDraggableData } from './utils';
import { getTaskLists, getTasks, moveTask } from '@/lib/task-helper';
import { type Task as TaskType } from '@/types/primitives/TaskBoard';
import { createClient } from '@/utils/supabase/client';
import {
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';

interface Props {
  boardId: string;
}

export function KanbanBoard({ boardId }: Props) {
  const queryClient = useQueryClient();
  const [activeColumn, setActiveColumn] = useState<Column | null>(null);
  const [activeTask, setActiveTask] = useState<TaskType | null>(null);
  const pickedUpTaskColumn = useRef<string | null>(null);

  // Query for lists
  const { data: columns = [], isLoading: isLoadingColumns } = useQuery({
    queryKey: ['taskLists', boardId],
    queryFn: async () => {
      const supabase = createClient();
      const lists = await getTaskLists(supabase, boardId);
      return lists.map((list) => ({
        id: list.id,
        title: list.name,
      }));
    },
  });

  // Query for tasks
  const { data: tasks = [], isLoading: isLoadingTasks } = useQuery({
    queryKey: ['tasks', boardId],
    queryFn: async () => {
      const supabase = createClient();
      const lists = await getTaskLists(supabase, boardId);
      const allTasks = await Promise.all(
        lists.map((list) => getTasks(supabase, list.id))
      );
      return allTasks.flat();
    },
  });

  // Mutation for moving tasks
  const moveTaskMutation = useMutation({
    mutationFn: async ({
      taskId,
      targetListId,
    }: {
      taskId: string;
      targetListId: string;
    }) => {
      const supabase = createClient();
      if (!supabase) throw new Error('Failed to create Supabase client');
      await moveTask(supabase, taskId, targetListId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    },
  });

  const columnsId = useMemo(() => columns.map((col) => col.id), [columns]);

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
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
      console.log(
        'DragStart - Picked up task from list:',
        pickedUpTaskColumn.current
      );
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

      // Use the original list ID from ref instead of current task list_id
      const originalListId = pickedUpTaskColumn.current;
      if (!originalListId) return;

      // Verify the lists exist
      const sourceListExists = columns.some(
        (col) => String(col.id) === originalListId
      );
      const targetListExists = columns.some(
        (col) => String(col.id) === targetListId
      );

      if (!sourceListExists || !targetListExists) return;

      if (originalListId === targetListId) return;

      // Optimistically update the UI
      queryClient.setQueryData(
        ['tasks', boardId],
        (oldTasks: TaskType[] | undefined) => {
          if (!oldTasks) return oldTasks;
          return oldTasks.map((task) =>
            task.id === activeTask.id
              ? { ...task, list_id: targetListId }
              : task
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
      console.log('DragEnd - No target found');
      pickedUpTaskColumn.current = null;
      return;
    }

    const activeType = active.data?.current?.type;
    if (!activeType) {
      console.log('DragEnd - No active type');
      pickedUpTaskColumn.current = null;
      return;
    }

    // Handle task movement
    if (activeType === 'Task') {
      const activeTask = active.data?.current?.task;
      if (!activeTask) {
        console.log('DragEnd - No active task data');
        pickedUpTaskColumn.current = null;
        return;
      }

      // Get target list ID
      let targetListId: string;
      if (over.data?.current?.type === 'Column') {
        targetListId = String(over.id);
        console.log('DragEnd - Dropping on column:', targetListId);
      } else if (over.data?.current?.type === 'Task') {
        targetListId = String(over.data.current.task.list_id);
        console.log('DragEnd - Dropping on task in list:', targetListId);
      } else {
        console.log('DragEnd - Invalid drop target type');
        pickedUpTaskColumn.current = null;
        return;
      }

      // Use the original list ID from ref
      const originalListId = pickedUpTaskColumn.current;
      if (!originalListId) {
        console.log('DragEnd - No original list ID found');
        pickedUpTaskColumn.current = null;
        return;
      }

      console.log('DragEnd - List IDs:', {
        originalListId,
        targetListId,
        currentType: typeof originalListId,
        targetType: typeof targetListId,
        isEqual: originalListId === targetListId,
      });

      // Verify the lists exist
      const sourceListExists = columns.some(
        (col) => String(col.id) === originalListId
      );
      const targetListExists = columns.some(
        (col) => String(col.id) === targetListId
      );

      if (!sourceListExists || !targetListExists) {
        console.log('DragEnd - Invalid list ID:', {
          sourceListExists,
          targetListExists,
        });
        pickedUpTaskColumn.current = null;
        return;
      }

      if (originalListId === targetListId) {
        console.log('DragEnd - Same list, skipping');
        pickedUpTaskColumn.current = null;
        return;
      }

      console.log('DragEnd - Moving task:', {
        taskId: activeTask.id,
        from: originalListId,
        to: targetListId,
      });

      moveTaskMutation.mutate({
        taskId: activeTask.id,
        targetListId,
      });
    }

    pickedUpTaskColumn.current = null;
  }

  if (isLoadingColumns || isLoadingTasks) {
    return <div>Loading...</div>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
    >
      <BoardContainer>
        <SortableContext items={columnsId}>
          {columns.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              tasks={tasks.filter((task) => task.list_id === column.id)}
              onTaskCreated={() =>
                queryClient.invalidateQueries({ queryKey: ['tasks', boardId] })
              }
              onListUpdated={() => {
                queryClient.invalidateQueries({
                  queryKey: ['taskLists', boardId],
                });
                queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
              }}
            />
          ))}
        </SortableContext>
        <TaskListForm
          boardId={boardId}
          onListCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['taskLists', boardId] });
            queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
          }}
        />
      </BoardContainer>
      <DragOverlay>
        {activeColumn && (
          <BoardColumn
            isOverlay
            column={activeColumn}
            tasks={tasks.filter((task) => task.list_id === activeColumn.id)}
            onTaskCreated={() =>
              queryClient.invalidateQueries({ queryKey: ['tasks', boardId] })
            }
          />
        )}
        {activeTask && <TaskCard task={activeTask} isOverlay />}
      </DragOverlay>
    </DndContext>
  );
}
