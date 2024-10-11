'use client';

import ColumnCreation from './columnCreation';
import { coordinateGetter } from './keyboard-preset';
import { type Task, TaskCard } from './task';
import type { Column } from './task-list';
import { BoardColumn, BoardContainer } from './task-list';
import { hasDraggableData } from './utils';
import {
  Announcements,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  UniqueIdentifier,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, arrayMove } from '@dnd-kit/sortable';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface KanbanBoardProps {
  wsId?: string;
  defaultCols: defaultCols[];
  initialTasks: Task[];
  boardId: string;
}

interface defaultCols {
  id?: UniqueIdentifier;
  board_id?: string | null;
  title?: string | null;
  position?: number | null;
  created_at?: string | null;
}

interface DefaultColumn {
  id: string;
  board_id: string;
  title: string;
  position: number;
  created_at: string;
}
export type ColumnId = DefaultColumn['id'];



export function KanbanBoard({
  wsId,
  defaultCols,
  initialTasks,
  boardId,
}: KanbanBoardProps) {
  const processedColumns = defaultCols.map((col) => ({
    id: col.id ?? '',
    board_id: col.board_id ?? '',
    title: col.title ?? 'Untitled',
    position: col.position ?? 0,
    created_at: col.created_at ?? '',
  }));

  const [columns] = useState<Column[]>(processedColumns);
  const pickedUpTaskColumn = useRef<ColumnId | null>(null);
  const columnsId = useMemo(() => columns.map((col) => col.id), [columns]);

  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [activeColumn, setActiveColumn] = useState<Column | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [portal, setPortal] = useState<React.ReactPortal | null>(null);

  useEffect(() => {
    if (window !== undefined && 'document' in window) {
      const portal = createPortal(
        <DragOverlay>
          {activeColumn && (
            <BoardColumn
              isOverlay
              column={activeColumn}
              tasks={tasks.filter((task) => task.columnId === activeColumn.id)}
            />
          )}
          {activeTask && <TaskCard task={activeTask} isOverlay />}
        </DragOverlay>,
        document.body
      );
      setPortal(portal);
    }
  }, [activeColumn, activeTask]);

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: coordinateGetter,
    })
  );

  function getDraggingTaskData(taskId: UniqueIdentifier, columnId: ColumnId) {
    const tasksInColumn = tasks.filter((task) => task.columnId === columnId);
    const taskPosition = tasksInColumn.findIndex((task) => task.id === taskId);
    const column = columns.find((col) => col.id === columnId);
    return {
      tasksInColumn,
      taskPosition,
      column,
    };
  }

  const announcements: Announcements = {
    onDragStart({ active }) {
      if (!hasDraggableData(active)) return;
      if (active.data.current?.type === 'Column') {
        const startColumnIdx = columnsId.findIndex((id) => id === active.id);
        const startColumn = columns[startColumnIdx];
        return `Picked up Column ${startColumn?.title} at position: ${
          startColumnIdx + 1
        } of ${columnsId.length}`;
      } else if (active.data.current?.type === 'Task') {
        pickedUpTaskColumn.current = active.data.current.task.columnId;
        const { tasksInColumn, taskPosition, column } = getDraggingTaskData(
          active.id,
          pickedUpTaskColumn.current || 'todo'
        );
        return `Picked up Task ${
          active.data.current.task.content
        } at position: ${taskPosition + 1} of ${
          tasksInColumn.length
        } in column ${column?.title}`;
      }
    },
    onDragOver({ active, over }) {
      if (!hasDraggableData(active) || !hasDraggableData(over)) return;

      if (
        active.data.current?.type === 'Column' &&
        over.data.current?.type === 'Column'
      ) {
        const overColumnIdx = columnsId.findIndex((id) => id === over.id);
        return `Column ${active.data.current.column.title} was moved over ${
          over.data.current.column.title
        } at position ${overColumnIdx + 1} of ${columnsId.length}`;
      } else if (
        active.data.current?.type === 'Task' &&
        over.data.current?.type === 'Task'
      ) {
        const { tasksInColumn, taskPosition, column } = getDraggingTaskData(
          over.id,
          over.data.current.task.columnId
        );
        if (over.data.current.task.columnId !== pickedUpTaskColumn.current) {
          return `Task ${
            active.data.current.task.content
          } was moved over column ${column?.title} in position ${
            taskPosition + 1
          } of ${tasksInColumn.length}`;
        }
        return `Task was moved over position ${taskPosition + 1} of ${
          tasksInColumn.length
        } in column ${column?.title}`;
      }
    },
    onDragEnd({ active, over }) {
      if (!hasDraggableData(active) || !hasDraggableData(over)) {
        pickedUpTaskColumn.current = null;
        return;
      }
      if (
        active.data.current?.type === 'Column' &&
        over.data.current?.type === 'Column'
      ) {
        const overColumnPosition = columnsId.findIndex((id) => id === over.id);

        return `Column ${
          active.data.current.column.title
        } was dropped into position ${overColumnPosition + 1} of ${
          columnsId.length
        }`;
      } else if (
        active.data.current?.type === 'Task' &&
        over.data.current?.type === 'Task'
      ) {
        const { tasksInColumn, taskPosition, column } = getDraggingTaskData(
          over.id,
          over.data.current.task.columnId
        );
        if (over.data.current.task.columnId !== pickedUpTaskColumn.current) {
          return `Task was dropped into column ${column?.title} in position ${
            taskPosition + 1
          } of ${tasksInColumn.length}`;
        }
        return `Task was dropped into position ${taskPosition + 1} of ${
          tasksInColumn.length
        } in column ${column?.title}`;
      }
      pickedUpTaskColumn.current = null;
    },
    onDragCancel({ active }) {
      pickedUpTaskColumn.current = null;
      if (!hasDraggableData(active)) return;
      return `Dragging ${active.data.current?.type} cancelled.`;
    },
  };

  return (
    <DndContext
      accessibility={{
        announcements,
      }}
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
    >
      {columns.length !== 0 && (
        <div className="pt-7 absolute right-4 top-4">
          <ColumnCreation wsId={wsId ?? ''} boardId={boardId} />
        </div>
      )}
      <div className="pt-16">
        <BoardContainer>
          {columns.length === 0 && (
            <div className="flex h-screen items-center justify-center">
              <ColumnCreation wsId={wsId ?? ''} boardId={boardId} />
            </div>
          )}
          <SortableContext items={columnsId}>
            {columns.map((col) => (
              <BoardColumn
                key={col.id}
                column={col}
                tasks={tasks
                  .filter((task) => task.columnId === col.id)
                  .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))} // Sort by position
              />
            ))}
          </SortableContext>
        </BoardContainer>
      </div>

      {portal}
    </DndContext>
  );

  function onDragStart(event: DragStartEvent) {
    if (!hasDraggableData(event.active)) return;
    const data = event.active.data.current;
    if (data?.type === 'Column') {
      setActiveColumn(data.column);
      return;
    }

    if (data?.type === 'Task') {
      setActiveTask(data.task);
      return;
    }
  }
  async function updateTaskPositionOnServer(
    taskId: UniqueIdentifier,
    columnId: string,
    position: number
  ) {
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/task-boards/column/${taskId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            tasks: {
              columnId,
              position,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error updating task:', errorData);
      } else {
        console.log('Task position updated successfully on the server.');
      }
    } catch (error) {
      console.error('Error updating task:', error);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveColumn(null);
    setActiveTask(null);

    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (!hasDraggableData(active)) return;

    const activeData = active.data.current;

    if (activeId === overId) return;

    const isActiveATask = activeData?.type === 'Task';

    if (!isActiveATask) return;

    // Find the new position based on drop target
    const newPosition = tasks.findIndex((task) => task.id === overId);

    // Update the task's position in the state
    setTasks((tasks) => {
      const activeIndex = tasks.findIndex((t) => t.id === activeId);

      // Move the task to the new position in the same or different column
      const updatedTasks = arrayMove(tasks, activeIndex, newPosition);

      // Reassign positions to each task (e.g., 1, 2, 3, etc.)
      const tasksWithUpdatedPositions = updatedTasks.map((task, index) => ({
        ...task,
        position: index + 1, // Update task's position
      }));
      console.log(tasksWithUpdatedPositions, 'taks position');
      // Send updated positions to the server
      tasksWithUpdatedPositions.forEach((task) => {
        console.log('update tasks');

        // Ensure we're updating the task with the new columnId and position
        updateTaskPositionOnServer(task.id, task.columnId, task.position);
      });

      return tasksWithUpdatedPositions;
    });
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    if (!hasDraggableData(active) || !hasDraggableData(over)) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    const isActiveATask = activeData?.type === 'Task';
    const isOverATask = overData?.type === 'Task';

    if (!isActiveATask) return;

    // Im dropping a Task over another Task
    if (isActiveATask && isOverATask) {
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);
        const overIndex = tasks.findIndex((t) => t.id === overId);
        const activeTask = tasks[activeIndex];
        const overTask = tasks[overIndex];
        if (
          activeTask &&
          overTask &&
          activeTask.columnId !== overTask.columnId
        ) {
          activeTask.columnId = overTask.columnId;
          return arrayMove(tasks, activeIndex, overIndex - 1);
        }

        return arrayMove(tasks, activeIndex, overIndex);
      });
    }

    const isOverAColumn = overData?.type === 'Column';

    // Im dropping a Task over a column
    if (isActiveATask && isOverAColumn) {
      setTasks((tasks) => {
        const activeIndex = tasks.findIndex((t) => t.id === activeId);
        const activeTask = tasks[activeIndex];
        if (activeTask) {
          activeTask.columnId = overId as ColumnId;
          return arrayMove(tasks, activeIndex, activeIndex);
        }
        return tasks;
      });
    }
  }
}
