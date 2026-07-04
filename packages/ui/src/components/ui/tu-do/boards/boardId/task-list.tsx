import { useDndMonitor, useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Loader2, MoveRight } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useTranslations } from 'next-intl';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { DragPreviewPosition } from './kanban/dnd/use-kanban-dnd';
import { MeasuredTaskCard } from './task';
import type { TaskCardAssigneeMemberSource } from './task-card/task-card';

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
  availableLists?: TaskList[];
  column: TaskList;
  boardId: string;
  workspaceId?: string;
  onUpdate: () => void;
  isMultiSelectMode?: boolean;
  selectedTasks?: Set<string>;
  isPersonalWorkspace?: boolean;
  canUseBoardAssignees?: boolean;
  assigneeMemberSource?: TaskCardAssigneeMemberSource;
  onTaskSelect?: (taskId: string, event: React.MouseEvent) => void;
  onClearSelection?: () => void;
  dragPreviewPosition?: DragPreviewPosition | null;
  suppressSortableTransform?: boolean;
  taskHeightsRef?: React.MutableRefObject<Map<string, number>>;
  optimisticUpdateInProgress?: Set<string>;
  bulkUpdateCustomDueDate?: (date: Date | null) => Promise<void>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  readOnly?: boolean;
}

interface TaskListContentProps {
  tasks: Task[];
  availableLists?: TaskList[];
  column: TaskList;
  boardId: string;
  workspaceId?: string;
  onUpdate: () => void;
  isMultiSelectMode?: boolean;
  selectedTasks?: Set<string>;
  isPersonalWorkspace?: boolean;
  canUseBoardAssignees?: boolean;
  assigneeMemberSource?: TaskCardAssigneeMemberSource;
  onTaskSelect?: (taskId: string, event: React.MouseEvent) => void;
  onClearSelection?: () => void;
  dragPreviewPosition?: DragPreviewPosition | null;
  suppressSortableTransform?: boolean;
  updateSize: (id: string, height: number) => void;
  optimisticUpdateInProgress?: Set<string>;
  bulkUpdateCustomDueDate?: (date: Date | null) => Promise<void>;
  startIndex?: number;
  taskOrder?: Pick<Task, 'id'>[];
  readOnly?: boolean;
}

export function getTaskDragPreviewSlotIndex({
  columnId,
  preview,
  tasks,
}: {
  columnId: string;
  preview: DragPreviewPosition | null | undefined;
  tasks: Pick<Task, 'id'>[];
}) {
  if (!preview || preview.listId !== columnId) return null;

  const activeTaskIndex = tasks.findIndex(
    (task) => task.id === preview.task.id
  );
  const maxSlotIndex = tasks.length;
  const renderInsertionIndex =
    activeTaskIndex !== -1 && preview.insertionIndex >= activeTaskIndex
      ? preview.insertionIndex + 1
      : preview.insertionIndex;

  return Math.max(0, Math.min(renderInsertionIndex, maxSlotIndex));
}

function DragPreviewSlot({
  columnId,
  preview,
}: {
  columnId: string;
  preview: DragPreviewPosition | null | undefined;
}) {
  if (!preview || preview.listId !== columnId) return null;

  const height =
    Number.isFinite(preview.height) && preview.height > 0
      ? Math.round(preview.height)
      : 96;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none"
      data-dnd-preview-slot="task"
      style={{ height }}
    />
  );
}

function TaskListContent({
  tasks,
  availableLists,
  column,
  boardId,
  workspaceId,
  onUpdate,
  isMultiSelectMode,
  selectedTasks,
  isPersonalWorkspace,
  canUseBoardAssignees,
  assigneeMemberSource,
  onTaskSelect,
  onClearSelection,
  dragPreviewPosition,
  suppressSortableTransform,
  updateSize,
  optimisticUpdateInProgress,
  bulkUpdateCustomDueDate,
  startIndex = 0,
  taskOrder = tasks,
  readOnly = false,
}: TaskListContentProps) {
  const slotIndex = getTaskDragPreviewSlotIndex({
    columnId: column.id,
    preview: dragPreviewPosition,
    tasks: taskOrder,
  });

  return (
    <>
      {slotIndex === startIndex && (
        <DragPreviewSlot columnId={column.id} preview={dragPreviewPosition} />
      )}
      {tasks.map((task, index) => {
        const isDraggedPreviewTask = dragPreviewPosition?.task.id === task.id;
        const globalIndex = startIndex + index;

        return (
          <React.Fragment key={task.id}>
            <MeasuredTaskCard
              task={task}
              taskList={column}
              boardId={boardId}
              workspaceId={workspaceId}
              availableLists={availableLists}
              onUpdate={onUpdate}
              isSelected={Boolean(
                isMultiSelectMode && selectedTasks?.has(task.id)
              )}
              isMultiSelectMode={isMultiSelectMode}
              isPersonalWorkspace={isPersonalWorkspace}
              canUseBoardAssignees={canUseBoardAssignees}
              assigneeMemberSource={assigneeMemberSource}
              onSelect={onTaskSelect}
              onClearSelection={onClearSelection}
              suppressSortableTransform={suppressSortableTransform}
              hiddenFromLayout={isDraggedPreviewTask}
              onHeight={(h) => updateSize(task.id, h)}
              optimisticUpdateInProgress={optimisticUpdateInProgress}
              selectedTasks={selectedTasks}
              bulkUpdateCustomDueDate={bulkUpdateCustomDueDate}
              readOnly={readOnly}
            />
            {slotIndex === globalIndex + 1 && (
              <DragPreviewSlot
                columnId={column.id}
                preview={dragPreviewPosition}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}

/** Sentinel element that triggers loading more items when scrolled into view */
function LoadMoreSentinel({
  onLoadMore,
  isLoading,
}: {
  onLoadMore: () => void;
  isLoading: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isLoading) {
          onLoadMore();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore, isLoading]);

  return (
    <div ref={sentinelRef} className="flex justify-center py-2">
      {isLoading && (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}

function VirtualizedTaskListInner({
  tasks,
  availableLists,
  column,
  boardId,
  workspaceId,
  onUpdate,
  isMultiSelectMode,
  selectedTasks,
  isPersonalWorkspace,
  canUseBoardAssignees,
  assigneeMemberSource,
  onTaskSelect,
  onClearSelection,
  dragPreviewPosition,
  suppressSortableTransform,
  taskHeightsRef: externalTaskHeightsRef,
  optimisticUpdateInProgress,
  bulkUpdateCustomDueDate,
  onLoadMore,
  hasMore,
  isLoadingMore,
  readOnly = false,
}: VirtualizedTaskListProps) {
  const t = useTranslations('common');
  const tTasks = useTranslations('ws-tasks');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isExternalStaging = column.is_external_staging === true;
  const { setNodeRef: setDroppableRef } = useDroppable({
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
      if (t) {
        if (t.list_id === column.id) setIsDraggingHere(true);
      }
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

  // Infinite scroll sentinel (rendered after tasks)
  const loadMoreSentinel =
    hasMore && onLoadMore ? (
      <LoadMoreSentinel
        onLoadMore={onLoadMore}
        isLoading={isLoadingMore ?? false}
      />
    ) : null;

  return (
    <div
      ref={attachScrollableRef}
      className="relative h-full flex-1 space-y-2 overflow-y-auto p-3"
      // When not virtualizing we still want consistent styling
      data-virtualized={shouldVirtualize ? 'true' : 'false'}
    >
      {tasks.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          {dragPreviewPosition?.listId === column.id ? (
            <div className="w-full px-1">
              <DragPreviewSlot
                columnId={column.id}
                preview={dragPreviewPosition}
              />
            </div>
          ) : isExternalStaging ? (
            <div className="flex max-w-56 flex-col items-center gap-2 text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dynamic-cyan/30 border-dashed bg-dynamic-cyan/10 text-dynamic-cyan">
                <MoveRight className="h-4 w-4" />
              </div>
              <p className="font-medium text-foreground text-sm">
                {tTasks('external_tasks_empty')}
              </p>
              <p className="text-muted-foreground text-xs leading-snug">
                {tTasks('external_tasks_empty_description')}
              </p>
            </div>
          ) : (
            <p className="text-center text-sm">{t('no_tasks_yet')}</p>
          )}
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
              <TaskListContent
                tasks={visibleTasks}
                availableLists={availableLists}
                column={column}
                boardId={boardId}
                workspaceId={workspaceId}
                onUpdate={onUpdate}
                isMultiSelectMode={isMultiSelectMode}
                selectedTasks={selectedTasks}
                isPersonalWorkspace={isPersonalWorkspace}
                canUseBoardAssignees={canUseBoardAssignees}
                assigneeMemberSource={assigneeMemberSource}
                onTaskSelect={onTaskSelect}
                onClearSelection={onClearSelection}
                dragPreviewPosition={dragPreviewPosition}
                suppressSortableTransform={suppressSortableTransform}
                updateSize={updateSize}
                optimisticUpdateInProgress={optimisticUpdateInProgress}
                bulkUpdateCustomDueDate={bulkUpdateCustomDueDate}
                startIndex={startIndex}
                taskOrder={tasks}
                readOnly={readOnly}
              />
            </div>
          </div>
          {loadMoreSentinel}
        </SortableContext>
      ) : (
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <TaskListContent
            tasks={tasks}
            availableLists={availableLists}
            column={column}
            boardId={boardId}
            workspaceId={workspaceId}
            onUpdate={onUpdate}
            isMultiSelectMode={isMultiSelectMode}
            selectedTasks={selectedTasks}
            isPersonalWorkspace={isPersonalWorkspace}
            canUseBoardAssignees={canUseBoardAssignees}
            assigneeMemberSource={assigneeMemberSource}
            onTaskSelect={onTaskSelect}
            onClearSelection={onClearSelection}
            dragPreviewPosition={dragPreviewPosition}
            suppressSortableTransform={suppressSortableTransform}
            updateSize={updateSize}
            optimisticUpdateInProgress={optimisticUpdateInProgress}
            bulkUpdateCustomDueDate={bulkUpdateCustomDueDate}
            taskOrder={tasks}
            readOnly={readOnly}
          />
          {loadMoreSentinel}
        </SortableContext>
      )}
    </div>
  );
}

export const VirtualizedTaskList = React.memo(VirtualizedTaskListInner);
