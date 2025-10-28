import { useDndMonitor, useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { cn } from '@tuturuuu/utils/format';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MeasuredTaskCard } from './task';

const VIRTUALIZE_THRESHOLD = 60; // only virtualize for fairly large lists
const ESTIMATED_ITEM_HEIGHT = 96; // px including margin (space-y-2 gap)
const OVERSCAN_PX = 400; // overscan in pixels above and below viewport for smoother scroll

// Lightweight list virtualization tuned for relatively uniform TaskCard heights.
// Assumptions:
//  - Average TaskCard height ~ 96px including margin gap (~84 card + 12 gap). We sample first few to refine.
//  - We only virtualize when task count exceeds VIRTUALIZE_THRESHOLD to avoid overhead for small lists.
//  - We keep overscan of 4 items above and below viewport to smooth fast scroll and during drag placeholder movement.
//  - Drag-and-drop library (dnd-kit) works since offscreen tasks simply aren't registered; this is acceptable for large columns
//    because user can only drag over visible tasks. Reordering across far distances relies on dropping into the column body,
//    which still updates list_id at column level.
interface VirtualizedTaskListProps {
  tasks: Task[];
  column: TaskList;
  boardId: string;
  onUpdate: () => void;
  isMultiSelectMode?: boolean;
  selectedTasks?: Set<string>;
  isPersonalWorkspace?: boolean;
  onTaskSelect?: (taskId: string, event: React.MouseEvent) => void;
  onClearSelection?: () => void;
  dragPreviewPosition?: {
    listId: string;
    overTaskId: string | null;
    position: 'before' | 'after' | 'empty';
    task: Task;
    height: number;
  } | null;
  taskHeightsRef?: React.MutableRefObject<Map<string, number>>;
  optimisticUpdateInProgress?: Set<string>;
}

function VirtualizedTaskListInner({
  tasks,
  column,
  boardId,
  onUpdate,
  isMultiSelectMode,
  selectedTasks,
  isPersonalWorkspace,
  onTaskSelect,
  onClearSelection,
  dragPreviewPosition,
  taskHeightsRef: externalTaskHeightsRef,
  optimisticUpdateInProgress,
}: VirtualizedTaskListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { setNodeRef: setDroppableRef, isOver: isColumnDragOver } =
    useDroppable({
      id: `column-surface-${column.id}`,
      data: {
        type: 'ColumnSurface',
        columnId: String(column.id),
      },
    });
  const attachScrollableRef = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      setDroppableRef(node);
    },
    [setDroppableRef]
  );
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [avgHeight, setAvgHeight] = useState(ESTIMATED_ITEM_HEIGHT);
  const sizesRef = useRef<Record<string, number>>({});
  const prefixHeightsRef = useRef<number[]>([]); // cumulative heights
  const idsRef = useRef<string[]>([]);

  const shouldVirtualize = tasks.length > VIRTUALIZE_THRESHOLD;
  const [isDraggingHere, setIsDraggingHere] = useState(false);

  // Monitor drag state to widen window while a task from this column is dragged
  useDndMonitor({
    onDragStart(event) {
      const t = event.active.data?.current?.task as Task | undefined;
      if (t && t.list_id === column.id) setIsDraggingHere(true);
    },
    onDragEnd() {
      setIsDraggingHere(false);
    },
    onDragCancel() {
      setIsDraggingHere(false);
    },
  });

  // Measure viewport height
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Scroll handler (rAF throttled)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !shouldVirtualize) return;
    let frame: number | null = null;
    const onScroll = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setScrollTop(el.scrollTop);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [shouldVirtualize]);

  // Recompute average height when sizes change
  const rebuildPrefixHeights = useCallback(() => {
    const ids = idsRef.current;
    let running = 0;
    const prefix: number[] = new Array(ids.length);
    for (let i = 0; i < ids.length; i++) {
      const key = ids[i];
      const h = key ? (sizesRef.current[key] ?? avgHeight) : avgHeight;
      prefix[i] = running;
      running += h;
    }
    prefixHeightsRef.current = prefix;
  }, [avgHeight]);

  const updateSize = useCallback(
    (id: string, height: number) => {
      const prev = sizesRef.current[id];
      if (prev === height) return;
      sizesRef.current[id] = height;

      // Also update external taskHeightsRef if provided
      if (externalTaskHeightsRef) {
        externalTaskHeightsRef.current.set(id, height);
      }

      const values = Object.values(sizesRef.current);
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        setAvgHeight(Math.round(sum / values.length));
      }
      rebuildPrefixHeights();
    },
    [rebuildPrefixHeights, externalTaskHeightsRef]
  );

  // Initialize idsRef when task list changes
  useEffect(() => {
    idsRef.current = tasks.map((t) => t.id);
    rebuildPrefixHeights();
  }, [tasks, rebuildPrefixHeights]);

  let totalHeight: number | undefined;
  let startIndex = 0;
  let endIndex = tasks.length;
  let offsetY = 0;
  let visibleTasks = tasks;

  if (shouldVirtualize) {
    const ids = idsRef.current;
    const prefix = prefixHeightsRef.current;
    const getOffset = (index: number) => prefix[index] ?? index * avgHeight;
    const getHeight = (index: number) => {
      const key = ids[index];
      return key ? (sizesRef.current[key] ?? avgHeight) : avgHeight;
    };

    // Binary search for first index whose bottom >= scrollTop - overscan
    const overscan = isDraggingHere ? OVERSCAN_PX * 2 : OVERSCAN_PX;
    const targetTop = Math.max(0, scrollTop - overscan);
    let lo = 0;
    let hi = tasks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const midBottom = getOffset(mid) + getHeight(mid);
      if (midBottom >= targetTop) hi = mid;
      else lo = mid + 1;
    }
    startIndex = lo;

    // Binary search for last index whose top <= scrollBottom + overscan
    const targetBottom = scrollTop + viewportHeight + overscan;
    lo = startIndex;
    hi = tasks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      const midTop = getOffset(mid);
      if (midTop <= targetBottom) lo = mid;
      else hi = mid - 1;
    }
    endIndex = Math.min(tasks.length, lo + 1);
    visibleTasks = tasks.slice(startIndex, endIndex);
    offsetY = getOffset(startIndex);
    const lastIndex = tasks.length - 1;
    const lastBottom = getOffset(lastIndex) + getHeight(lastIndex);
    totalHeight = lastBottom;
  }

  return (
    <div
      ref={attachScrollableRef}
      className={cn(
        'relative h-full flex-1 space-y-2 overflow-y-auto p-3 transition-all duration-200',
        isColumnDragOver &&
          'fade-in-0 animate-in rounded-lg bg-linear-to-br from-primary/10 via-primary/5 to-transparent shadow-inner ring-2 ring-primary/40 duration-300'
      )}
      // When not virtualizing we still want consistent styling
      data-virtualized={shouldVirtualize ? 'true' : 'false'}
    >
      {/* Drop indicator when hovering over empty column */}
      {tasks.length === 0 && isColumnDragOver && (
        <div className="fade-in-0 zoom-in-95 absolute inset-4 flex animate-in flex-col items-center justify-center gap-3 rounded-lg border-2 border-primary/50 border-dashed bg-primary/5 duration-300">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 ring-4 ring-primary/10">
            <svg
              className="h-6 w-6 animate-bounce text-primary"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>
                Drop here to add (or drag tasks onto the + Add task button)
              </title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </div>
          <p className="font-semibold text-primary text-sm">Drop here to add</p>
        </div>
      )}
      {tasks.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          <p className="text-center text-sm">No tasks yet</p>
        </div>
      ) : shouldVirtualize ? (
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div
              className="grid gap-2"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${offsetY}px)`,
              }}
            >
              {/* Preview at beginning of list - when dropping on column header */}
              {dragPreviewPosition?.position === 'before' &&
                dragPreviewPosition.overTaskId === null && (
                  <div
                    className="flex items-center justify-center rounded-lg border-2 border-primary/50 border-dashed bg-primary/5 opacity-60"
                    style={{ height: `${dragPreviewPosition.height}px` }}
                  >
                    <p className="text-muted-foreground text-xs">
                      {dragPreviewPosition.task.name}
                    </p>
                  </div>
                )}

              {visibleTasks.map((task, idx) => (
                <React.Fragment key={task.id}>
                  {/* Preview before this specific task - but NOT for the task being dragged or when dragging within the same list */}
                  {dragPreviewPosition?.position === 'before' &&
                    dragPreviewPosition.overTaskId === task.id &&
                    dragPreviewPosition.task.id !== task.id &&
                    dragPreviewPosition.task.list_id !== column.id && (
                      <div
                        className="flex items-center justify-center rounded-lg border-2 border-primary/50 border-dashed bg-primary/5 opacity-60"
                        style={{ height: `${dragPreviewPosition.height}px` }}
                      >
                        <p className="text-muted-foreground text-xs">
                          {dragPreviewPosition.task.name}
                        </p>
                      </div>
                    )}

                  <MeasuredTaskCard
                    task={task}
                    taskList={column}
                    boardId={boardId}
                    onUpdate={onUpdate}
                    isSelected={Boolean(
                      isMultiSelectMode && selectedTasks?.has(task.id)
                    )}
                    isMultiSelectMode={isMultiSelectMode}
                    isPersonalWorkspace={isPersonalWorkspace}
                    onSelect={onTaskSelect}
                    onClearSelection={onClearSelection}
                    onHeight={(h) => updateSize(task.id, h)}
                    optimisticUpdateInProgress={optimisticUpdateInProgress}
                    selectedTasks={selectedTasks}
                  />

                  {/* Preview at end of list - when dropping on column surface */}
                  {dragPreviewPosition?.position === 'empty' &&
                    idx === visibleTasks.length - 1 && (
                      <div
                        className="flex items-center justify-center rounded-lg border-2 border-primary/50 border-dashed bg-primary/5 opacity-60"
                        style={{ height: `${dragPreviewPosition.height}px` }}
                      >
                        <p className="text-muted-foreground text-xs">
                          {dragPreviewPosition.task.name}
                        </p>
                      </div>
                    )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </SortableContext>
      ) : (
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {/* Preview at beginning of list - when dropping on column header */}
          {dragPreviewPosition?.position === 'before' &&
            dragPreviewPosition.overTaskId === null && (
              <div
                className="flex items-center justify-center rounded-lg border-2 border-primary/50 border-dashed bg-primary/5 opacity-60"
                style={{ height: `${dragPreviewPosition.height}px` }}
              >
                <p className="text-muted-foreground text-xs">
                  {dragPreviewPosition.task.name}
                </p>
              </div>
            )}

          {tasks.map((task, idx) => (
            <React.Fragment key={task.id}>
              {/* Preview before this specific task - but NOT for the task being dragged or when dragging within the same list */}
              {dragPreviewPosition?.position === 'before' &&
                dragPreviewPosition.overTaskId === task.id &&
                dragPreviewPosition.task.id !== task.id &&
                dragPreviewPosition.task.list_id !== column.id && (
                  <div
                    className="flex items-center justify-center rounded-lg border-2 border-primary/50 border-dashed bg-primary/5 opacity-60"
                    style={{ height: `${dragPreviewPosition.height}px` }}
                  >
                    <p className="text-muted-foreground text-xs">
                      {dragPreviewPosition.task.name}
                    </p>
                  </div>
                )}

              <MeasuredTaskCard
                task={task}
                taskList={column}
                boardId={boardId}
                onUpdate={onUpdate}
                isSelected={Boolean(
                  isMultiSelectMode && selectedTasks?.has(task.id)
                )}
                isMultiSelectMode={isMultiSelectMode}
                isPersonalWorkspace={isPersonalWorkspace}
                onSelect={onTaskSelect}
                onClearSelection={onClearSelection}
                onHeight={(h) => updateSize(task.id, h)}
                optimisticUpdateInProgress={optimisticUpdateInProgress}
                selectedTasks={selectedTasks}
              />

              {/* Preview at end of list - when dropping on column surface */}
              {dragPreviewPosition?.position === 'empty' &&
                idx === tasks.length - 1 && (
                  <div
                    className="flex items-center justify-center rounded-lg border-2 border-primary/50 border-dashed bg-primary/5 opacity-60"
                    style={{ height: `${dragPreviewPosition.height}px` }}
                  >
                    <p className="text-muted-foreground text-xs">
                      {dragPreviewPosition.task.name}
                    </p>
                  </div>
                )}
            </React.Fragment>
          ))}
        </SortableContext>
      )}
    </div>
  );
}

export const VirtualizedTaskList = React.memo(VirtualizedTaskListInner);
