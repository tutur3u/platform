'use client';

import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
} from '@dnd-kit/sortable';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { LightweightTaskCard } from '@tuturuuu/ui/tuDo/boards/boardId/task';
import {
  BoardColumn,
  BoardContainer,
} from '@tuturuuu/ui/tuDo/boards/boardId/task-list';
import { TaskListForm } from '@tuturuuu/ui/tuDo/boards/boardId/task-list-form';
import { coordinateGetter } from '@tuturuuu/utils/keyboard-preset';
import { getTaskLists, useMoveTask } from '@tuturuuu/utils/task-helper';
import { hasDraggableData } from '@tuturuuu/utils/task-helpers';
import {
  type UIEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

interface Props {
  boardId: string;
  tasks: Task[];
  isLoading: boolean;
}

export function KanbanBoard({ boardId, tasks, isLoading }: Props) {
  const [columns, setColumns] = useState<TaskList[]>([]);
  const [activeColumn, setActiveColumn] = useState<TaskList | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [isScrollbarActive, setIsScrollbarActive] = useState(false);
  const pickedUpTaskColumn = useRef<string | null>(null);
  const queryClient = useQueryClient();
  const moveTaskMutation = useMoveTask(boardId);
  // Ref for the Kanban board container
  const boardRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const columnsContainerRef = useRef<HTMLDivElement>(null);
  const dragStartCardLeft = useRef<number | null>(null);
  const [overlayWidth, setOverlayWidth] = useState(350); // Column width, computed dynamically
  const overlayWidthRef = useRef(350);

  // Compute overlay width from first column or fallback to 350
  const computeOverlayWidth = useCallback(() => {
    const firstColumn = document.querySelector('[data-column-id]');
    if (firstColumn) {
      const rect = firstColumn.getBoundingClientRect();
      const width = rect.width;
      if (width > 0) {
        overlayWidthRef.current = width;
        setOverlayWidth(width);
        return;
      }
    }
    // Fallback to 350 if no column found or invalid width
    overlayWidthRef.current = 350;
    setOverlayWidth(350);
  }, []);

  // Sync scroll between main content and fixed scrollbar
  const syncScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget as HTMLElement;
    if (target === boardRef.current && scrollbarRef.current) {
      scrollbarRef.current.scrollLeft = target.scrollLeft;
    } else if (target === scrollbarRef.current && boardRef.current) {
      boardRef.current.scrollLeft = target.scrollLeft;
    }
  }, []);

  const handleScrollbarRelease = useCallback(() => {
    setTimeout(() => setIsScrollbarActive(false), 500);
  }, []);

  const handleTaskCreated = useCallback(() => {
    // Invalidate the tasks query to trigger a refetch
    queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
    queryClient.invalidateQueries({ queryKey: ['task_lists', boardId] });
  }, [queryClient, boardId]);

  // Attach scrollbar interaction listeners directly to scrollbar element
  useEffect(() => {
    const scrollbar = scrollbarRef.current;
    if (!scrollbar) return;

    const handlePointerDown = () => setIsScrollbarActive(true);
    const handlePointerUp = () => handleScrollbarRelease();
    const handleMouseDown = () => setIsScrollbarActive(true);
    const handleMouseUp = () => handleScrollbarRelease();
    const handleMouseLeave = () => setIsScrollbarActive(false);

    scrollbar.addEventListener('pointerdown', handlePointerDown);
    scrollbar.addEventListener('pointerup', handlePointerUp);
    scrollbar.addEventListener('mousedown', handleMouseDown);
    scrollbar.addEventListener('mouseup', handleMouseUp);
    scrollbar.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      scrollbar.removeEventListener('pointerdown', handlePointerDown);
      scrollbar.removeEventListener('pointerup', handlePointerUp);
      scrollbar.removeEventListener('mousedown', handleMouseDown);
      scrollbar.removeEventListener('mouseup', handleMouseUp);
      scrollbar.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [handleScrollbarRelease]);

  // Keep bottom spacer width in sync with content width
  useEffect(() => {
    const update = () => {
      if (!scrollbarRef.current || !boardRef.current) return;
      const spacer = scrollbarRef.current
        .firstElementChild as HTMLDivElement | null;
      if (spacer) spacer.style.width = `${boardRef.current.scrollWidth}px`;
    };
    update();
    const ro = new ResizeObserver(update);
    if (boardRef.current) ro.observe(boardRef.current);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // Compute overlay width on mount and resize
  useEffect(() => {
    computeOverlayWidth();
    window.addEventListener('resize', computeOverlayWidth);
    return () => window.removeEventListener('resize', computeOverlayWidth);
  }, [computeOverlayWidth]);

  // Handle Shift + Wheel for horizontal scrolling with non-passive listener
  useEffect(() => {
    const boardElement = boardRef.current;
    if (!boardElement) return;

    const handleWheel = (e: WheelEvent) => {
      // Enable Shift + Wheel for horizontal scrolling
      if (e.shiftKey) {
        e.preventDefault();
        boardElement.scrollLeft += e.deltaY;
      }
    };

    boardElement.addEventListener('wheel', handleWheel, { passive: false });
    return () => boardElement.removeEventListener('wheel', handleWheel);
  }, []);

  // Multi-select handlers
  const handleTaskSelect = useCallback(
    (taskId: string, event: React.MouseEvent) => {
      const isCtrlPressed = event.ctrlKey || event.metaKey;
      const isShiftPressed = event.shiftKey;

      if (isCtrlPressed || isShiftPressed) {
        event.preventDefault();
        event.stopPropagation();

        setIsMultiSelectMode(true);

        if (isCtrlPressed) {
          // Toggle selection
          setSelectedTasks((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(taskId)) {
              newSet.delete(taskId);
            } else {
              newSet.add(taskId);
            }
            return newSet;
          });
        } else if (isShiftPressed) {
          // Range selection (if there's a last selected task)
          // For now, just add to selection
          setSelectedTasks((prev) => new Set([...prev, taskId]));
        }
      } else {
        // Single click - clear selection and select only this task
        setSelectedTasks(new Set([taskId]));
        setIsMultiSelectMode(false);
      }
    },
    []
  );

  const clearSelection = useCallback(() => {
    setSelectedTasks(new Set());
    setIsMultiSelectMode(false);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearSelection]);

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
      console.log('🎯 onDragStart - Task:', task);
      console.log('📋 Task list_id:', task.list_id);
      console.log('📋 Selected tasks:', selectedTasks);
      console.log('📋 Is multi-select mode:', isMultiSelectMode);

      // If this is a multi-select drag, include all selected tasks
      if (isMultiSelectMode && selectedTasks.has(task.id)) {
        console.log('📋 Multi-select drag detected');
        console.log('📋 Number of selected tasks:', selectedTasks.size);
        setActiveTask(task); // Set the dragged task as active for overlay
      } else {
        setActiveTask(task);
      }

      pickedUpTaskColumn.current = String(task.list_id);
      console.log('📋 pickedUpTaskColumn set to:', pickedUpTaskColumn.current);

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

      console.log(
        '🔄 onDragOver - Optimistically updating task:',
        activeTask.id,
        'to list:',
        targetListId
      );

      // Optimistically update the tasks in the cache for preview
      queryClient.setQueryData(
        ['tasks', boardId],
        (oldData: Task[] | undefined) => {
          if (!oldData) return oldData;

          // If multi-select mode, update all selected tasks
          if (isMultiSelectMode && selectedTasks.size > 1) {
            console.log(
              '🔄 onDragOver - Optimistically updating multiple tasks to list:',
              targetListId
            );
            return oldData.map((t) =>
              selectedTasks.has(t.id) ? { ...t, list_id: targetListId } : t
            );
          } else {
            // Single task update
            return oldData.map((t) =>
              t.id === activeTask.id ? { ...t, list_id: targetListId } : t
            );
          }
        }
      );
    }
  }

  // Memoized DragOverlay content to minimize re-renders
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

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    console.log('🔄 onDragEnd triggered');
    console.log('📦 Active:', active);
    console.log('🎯 Over:', over);

    // Store the original list ID before resetting drag state
    const originalListId = pickedUpTaskColumn.current;

    // Always reset drag state, even on invalid drop
    setActiveColumn(null);
    setActiveTask(null);
    pickedUpTaskColumn.current = null;
    dragStartCardLeft.current = null;

    if (!over) {
      console.log('❌ No drop target detected, state reset.');
      return;
    }

    const activeType = active.data?.current?.type;
    console.log('🏷️ Active type:', activeType);

    if (!activeType) {
      console.log('❌ No activeType, state reset.');
      return;
    }

    if (activeType === 'Task') {
      const activeTask = active.data?.current?.task;
      console.log('📋 Active task:', activeTask);

      if (!activeTask) {
        console.log('❌ No activeTask, state reset.');
        return;
      }

      let targetListId: string;
      const overType = over.data?.current?.type;
      console.log('🎯 Over type:', overType);

      if (overType === 'Column') {
        targetListId = String(over.id);
        console.log('📋 Dropping on column, targetListId:', targetListId);
      } else if (overType === 'Task') {
        // When dropping on a task, use the list_id of the target task
        const targetTask = over.data?.current?.task;
        if (!targetTask) {
          console.log('❌ No target task data, state reset.');
          return;
        }
        targetListId = String(targetTask.list_id);
        console.log('📋 Dropping on task, targetListId:', targetListId);
        console.log('📋 Target task details:', targetTask);
      } else {
        console.log('❌ Invalid drop type:', overType, 'state reset.');
        return;
      }

      // Use the stored original list ID from drag start
      console.log('🏠 Original list ID (from drag start):', originalListId);
      console.log('🎯 Target list ID:', targetListId);
      console.log(
        '📋 Active task full data:',
        event.active.data?.current?.task
      );

      if (!originalListId) {
        console.log('❌ No originalListId, state reset.');
        return;
      }

      const sourceListExists = columns.some(
        (col) => String(col.id) === originalListId
      );
      const targetListExists = columns.some(
        (col) => String(col.id) === targetListId
      );

      console.log('🔍 Source list exists:', sourceListExists);
      console.log('🔍 Target list exists:', targetListExists);
      console.log(
        '📊 Available columns:',
        columns.map((col) => ({ id: col.id, name: col.name }))
      );
      console.log(
        '📋 Tasks in source list:',
        tasks
          .filter((t) => t.list_id === originalListId)
          .map((t) => ({ id: t.id, name: t.name }))
      );
      console.log(
        '📋 Tasks in target list:',
        tasks
          .filter((t) => t.list_id === targetListId)
          .map((t) => ({ id: t.id, name: t.name }))
      );

      if (!sourceListExists || !targetListExists) {
        console.log('❌ Source or target list missing, state reset.');
        return;
      }

      // Only move if actually changing lists
      if (targetListId !== originalListId) {
        console.log('✅ Lists are different, initiating move mutation');

        // Check if this is a multi-select drag
        if (isMultiSelectMode && selectedTasks.size > 1) {
          console.log(
            '📤 Batch moving tasks:',
            Array.from(selectedTasks),
            'from',
            originalListId,
            'to',
            targetListId
          );

          // Move all selected tasks
          const tasksToMove = Array.from(selectedTasks);
          tasksToMove.forEach((taskId) => {
            moveTaskMutation.mutate({
              taskId,
              newListId: targetListId,
            });
          });

          // Clear selection after batch move
          clearSelection();
        } else {
          console.log(
            '📤 Moving single task:',
            activeTask.id,
            'from',
            originalListId,
            'to',
            targetListId
          );

          moveTaskMutation.mutate({
            taskId: activeTask.id,
            newListId: targetListId,
          });
        }
      } else {
        console.log('ℹ️ Same list detected, no move needed');
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
      {/* Multi-select indicator */}
      {isMultiSelectMode && selectedTasks.size > 0 && (
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {selectedTasks.size} task{selectedTasks.size !== 1 ? 's' : ''}{' '}
              selected
            </span>
            <span className="text-muted-foreground text-xs">
              Drag to move all • Press Esc to clear
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            className="h-6 px-2 text-xs"
          >
            Clear
          </Button>
        </div>
      )}

      {/* Kanban Board */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* Main horizontal scroller */}
        <div
          ref={boardRef}
          onScroll={syncScroll}
          className="scrollbar-none h-full overflow-x-auto overflow-y-hidden pb-4"
        >
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
                <div
                  ref={columnsContainerRef}
                  className="flex h-full flex-shrink-0 gap-4"
                >
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
                        statusOrder[a.status as keyof typeof statusOrder] ??
                        999;
                      const statusB =
                        statusOrder[b.status as keyof typeof statusOrder] ??
                        999;
                      if (statusA !== statusB) return statusA - statusB;
                      return (a.position || 0) - (b.position || 0);
                    })
                    .map((column) => {
                      const columnTasks = tasks.filter(
                        (task) => task.list_id === column.id
                      );
                      return (
                        <BoardColumn
                          key={column.id}
                          column={column}
                          boardId={boardId}
                          tasks={columnTasks}
                          onTaskCreated={handleTaskCreated}
                          onListUpdated={handleTaskCreated}
                          selectedTasks={selectedTasks}
                          isMultiSelectMode={isMultiSelectMode}
                          onTaskSelect={handleTaskSelect}
                          isScrollbarActive={isScrollbarActive}
                        />
                      );
                    })}
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
              {activeTask && (
                <LightweightTaskCard
                  task={activeTask}
                  isMinimalMode={isScrollbarActive}
                />
              )}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Fixed bottom scrollbar, synced with boardRef */}
        <div
          ref={scrollbarRef}
          onScroll={syncScroll}
          className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/50 pointer-events-auto sticky bottom-0 left-0 z-10 h-4 w-full overflow-x-auto overflow-y-hidden"
          aria-hidden="true"
        >
          {/* Spacer that mirrors content width */}
          <div
            style={{
              width: `${boardRef.current?.scrollWidth ?? 0}px`,
              height: 1,
            }}
          />
        </div>
      </div>
    </div>
  );
}
