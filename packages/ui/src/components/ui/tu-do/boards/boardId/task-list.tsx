import { useDndMonitor, useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from '@tuturuuu/icons';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { useParams } from 'next/navigation';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { TaskEditDialog } from '../../shared/task-edit-dialog';
import { ListActions } from './list-actions';
import { statusIcons } from './status-section';
import { MeasuredTaskCard } from './task';

// Color mappings for visual consistency
const colorClasses: Record<SupportedColor, string> = {
  GRAY: 'border-l-dynamic-gray/50 bg-dynamic-gray/5',
  RED: 'border-l-dynamic-red/50 bg-dynamic-red/5',
  BLUE: 'border-l-dynamic-blue/50 bg-dynamic-blue/5',
  GREEN: 'border-l-dynamic-green/50 bg-dynamic-green/5',
  YELLOW: 'border-l-dynamic-yellow/50 bg-dynamic-yellow/5',
  ORANGE: 'border-l-dynamic-orange/50 bg-dynamic-orange/5',
  PURPLE: 'border-l-dynamic-purple/50 bg-dynamic-purple/5',
  PINK: 'border-l-dynamic-pink/50 bg-dynamic-pink/5',
  INDIGO: 'border-l-dynamic-indigo/50 bg-dynamic-indigo/5',
  CYAN: 'border-l-dynamic-cyan/50 bg-dynamic-cyan/5',
};

interface BoardColumnProps {
  column: TaskList;
  boardId: string;
  tasks: Task[];
  isOverlay?: boolean;
  onUpdate?: () => void;
  selectedTasks?: Set<string>;
  isMultiSelectMode?: boolean;
  isPersonalWorkspace?: boolean;
  onTaskSelect?: (taskId: string, event: React.MouseEvent) => void;
  onAddTask?: (list: TaskList) => void;
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

function BoardColumnInner({
  column,
  boardId,
  tasks,
  isOverlay,
  onUpdate,
  selectedTasks,
  onTaskSelect,
  isMultiSelectMode,
  isPersonalWorkspace,
  onAddTask,
  dragPreviewPosition,
  taskHeightsRef,
  optimisticUpdateInProgress,
}: BoardColumnProps) {
  const [localCreateOpen, setLocalCreateOpen] = useState(false);
  const params = useParams();
  const wsId = params.wsId as string;

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: {
      type: 'Column',
      column: {
        ...column,
        id: String(column.id),
      },
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleUpdate = () => {
    onUpdate?.();
  };

  const colorClass =
    colorClasses[column.color as SupportedColor] || colorClasses.GRAY;
  const statusIcon = statusIcons[column.status];

  // Memoize drag handle for performance
  const DragHandle = useMemo(
    () => (
      <div
        {...attributes}
        {...listeners}
        className={cn(
          '-ml-2 h-auto cursor-grab p-1 opacity-40 transition-all',
          'hover:bg-black/5 group-hover:opacity-70',
          isDragging && 'opacity-100',
          isOverlay && 'cursor-grabbing'
        )}
        title="Drag to move list"
      >
        <span className="sr-only">Move list</span>
        <GripVertical className="h-4 w-4" />
      </div>
    ),
    [attributes, listeners, isDragging, isOverlay]
  );

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex h-full w-[350px] flex-col rounded-xl transition-all duration-200',
        'touch-none select-none',
        colorClass,
        isDragging &&
          'rotate-1 scale-[1.02] opacity-90 shadow-xl ring-2 ring-primary/20',
        isOverlay && 'shadow-2xl ring-2 ring-primary/30',
        'hover:shadow-md',
        // Visual feedback for invalid drop (dev only)
        DEV_MODE && isDragging && !isOverlay && 'ring-2 ring-red-400/60',
        'border-0'
      )}
    >
      <div className="flex items-center gap-2 rounded-t-xl border-b p-3">
        {DragHandle}
        <div className="flex flex-1 items-center gap-2">
          <span className="text-sm">{statusIcon}</span>
          <h3 className="font-semibold text-foreground/90 text-sm">
            {column.name}
          </h3>
          <Badge
            variant="secondary"
            className={cn(
              'px-2 py-0.5 font-medium text-xs',
              tasks.length === 0 ? 'text-muted-foreground' : 'text-foreground'
            )}
          >
            {tasks.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <ListActions
            listId={column.id}
            listName={column.name}
            listStatus={column.status}
            tasks={tasks}
            boardId={boardId}
            wsId={wsId}
            onUpdate={handleUpdate}
            onSelectAll={
              onTaskSelect && tasks.length > 0
                ? () => {
                    // Select all tasks in this list
                    tasks.forEach((task) => {
                      // Simulate shift+click to add to selection
                      const fakeEvent = {
                        shiftKey: true,
                        ctrlKey: false,
                        metaKey: false,
                        preventDefault: () => {},
                        stopPropagation: () => {},
                      } as React.MouseEvent;
                      onTaskSelect(task.id, fakeEvent);
                    });
                  }
                : undefined
            }
          />
        </div>
      </div>

      {/* Virtualized Tasks Container */}
      <VirtualizedTaskList
        tasks={tasks}
        column={column}
        boardId={boardId}
        onUpdate={handleUpdate}
        isMultiSelectMode={isMultiSelectMode}
        selectedTasks={selectedTasks}
        isPersonalWorkspace={isPersonalWorkspace}
        onTaskSelect={onTaskSelect}
        dragPreviewPosition={dragPreviewPosition}
        taskHeightsRef={taskHeightsRef}
        optimisticUpdateInProgress={optimisticUpdateInProgress}
      />

      <div className="rounded-b-xl border-t p-3 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onAddTask ? onAddTask(column) : setLocalCreateOpen(true)
          }
          className="w-full justify-start rounded-lg border border-dynamic-gray/40 border-dashed text-muted-foreground text-xs transition-all hover:border-dynamic-gray/60 hover:bg-muted/40 hover:text-foreground"
        >
          + Add task
        </Button>
      </div>

      {/* Local fallback modal if parent handler not provided */}
      {!onAddTask && (
        <TaskEditDialog
          task={
            {
              id: 'new',
              name: '',
              description: '',
              priority: null,
              start_date: null,
              end_date: null,
              estimation_points: null,
              list_id: column.id,
              labels: [],
              archived: false,
              assignees: [],
            } as any
          }
          boardId={boardId}
          isOpen={localCreateOpen}
          onClose={() => setLocalCreateOpen(false)}
          onUpdate={handleUpdate}
          availableLists={[column]}
          mode="create"
        />
      )}
    </Card>
  );
}

export const BoardColumn = React.memo(BoardColumnInner);

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
          'fade-in-0 animate-in rounded-lg bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-inner ring-2 ring-primary/40 duration-300'
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
                    onHeight={(h) => updateSize(task.id, h)}
                    optimisticUpdateInProgress={optimisticUpdateInProgress}
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
                onHeight={(h) => updateSize(task.id, h)}
                optimisticUpdateInProgress={optimisticUpdateInProgress}
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
