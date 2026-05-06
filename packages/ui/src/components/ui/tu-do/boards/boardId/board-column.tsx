import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Loader2,
  MoveRight,
} from '@tuturuuu/icons';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTaskDialog } from '../../hooks/useTaskDialog';
import { useProgressiveLoader } from '../../shared/progressive-loader-context';
import { normalizeBoardText } from './board-text-utils';
import { ListActions } from './list-actions';
import { statusIcons } from './status-section';
import type { TaskFilters } from './task-filter';
import { VirtualizedTaskList } from './task-list';

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
  availableLists?: TaskList[];
  isOverlay?: boolean;
  onUpdate?: () => void;
  selectedTasks?: Set<string>;
  isMultiSelectMode?: boolean;
  setIsMultiSelectMode?: (value: boolean) => void;
  isPersonalWorkspace?: boolean;
  onTaskSelect?: (taskId: string, event: React.MouseEvent) => void;
  onClearSelection?: () => void;
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
  filters?: TaskFilters;
  bulkUpdateCustomDueDate?: (date: Date | null) => Promise<void>;
  workspaceId?: string;
  wsId: string;
  onExternalTasksCollapsedChange?: (collapsed: boolean) => void;
}

export function BoardColumn({
  column,
  boardId,
  tasks,
  availableLists,
  isOverlay,
  onUpdate,
  selectedTasks,
  onTaskSelect,
  onClearSelection,
  isMultiSelectMode,
  setIsMultiSelectMode,
  isPersonalWorkspace,
  onAddTask,
  dragPreviewPosition,
  taskHeightsRef,
  optimisticUpdateInProgress,
  filters,
  bulkUpdateCustomDueDate,
  workspaceId,
  wsId,
  onExternalTasksCollapsedChange,
}: BoardColumnProps) {
  const t = useTranslations('common');
  const tTasks = useTranslations('ws-tasks');
  const { createTask } = useTaskDialog();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const { pagination, loadListPage } = useProgressiveLoader();
  const isExternalStaging = column.is_external_staging === true;
  const isExternalCollapsed =
    isExternalStaging && column.is_external_collapsed === true;
  const listState = pagination[column.id];
  const isInitialLoad = !listState || listState.isInitialLoad;
  const hasActiveFilters =
    !!filters &&
    (filters.labels.length > 0 ||
      filters.assignees.length > 0 ||
      filters.projects.length > 0 ||
      filters.priorities.length > 0 ||
      !!filters.dueDateRange?.from ||
      !!filters.searchQuery?.trim() ||
      filters.includeMyTasks ||
      filters.includeUnassigned ||
      !!filters.sortBy);
  const recoveryRequestedRef = useRef(false);

  // Viewport detection — trigger first page load when column becomes visible
  const columnRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = columnRef.current;
    if (!el || listState || isExternalCollapsed) return; // Already loaded, loading, or intentionally collapsed
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          loadListPage(column.id, 0);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // Pre-fetch slightly before visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [column.id, isExternalCollapsed, listState, loadListPage]);

  // Recovery path: if the list metadata says tasks exist but the shared tasks
  // cache was cleared, refetch page 0 for this list so cards reappear.
  useEffect(() => {
    if (
      isExternalCollapsed ||
      !listState ||
      listState.isLoading ||
      hasActiveFilters
    )
      return;

    if (listState.totalCount > 0 && tasks.length === 0) {
      if (recoveryRequestedRef.current) return;
      recoveryRequestedRef.current = true;
      loadListPage(column.id, 0).finally(() => {
        recoveryRequestedRef.current = false;
      });
      return;
    }

    recoveryRequestedRef.current = false;
  }, [
    column.id,
    hasActiveFilters,
    isExternalCollapsed,
    listState,
    listState?.isLoading,
    listState?.totalCount,
    loadListPage,
    tasks.length,
  ]);

  // Load more pages (infinite scroll callback)
  const handleLoadMore = useCallback(() => {
    if (!listState || listState.isLoading || !listState.hasMore) return;
    loadListPage(column.id, listState.page + 1);
  }, [column.id, listState, loadListPage]);

  // Helper to translate standard list names
  const translateListName = (name: string | null | undefined): string => {
    const normalized = normalizeBoardText(name).replace(/\s+/g, '');
    const translations: Record<string, string> = {
      todo: t('list_name_to_do'),
      inprogress: t('list_name_in_progress'),
      done: t('list_name_done'),
      closed: t('list_name_closed'),
    };
    return translations[normalized] ?? name ?? '';
  };

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    disabled: isExternalStaging,
    data: {
      type: 'Column',
      column: {
        ...column,
        id: String(column.id),
      },
    },
  });

  // Compose refs: dnd-kit sortable ref + our viewport detection ref
  const composedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      (columnRef as React.MutableRefObject<HTMLDivElement | null>).current =
        node;
    },
    [setNodeRef]
  );

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

  // Badge count: prefer totalCount from progressive loader when available
  const badgeCount = listState?.totalCount ?? tasks.length;

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
        title={t('drag_to_move_list')}
      >
        <span className="sr-only">{t('move_list')}</span>
        <GripVertical className="h-4 w-4" />
      </div>
    ),
    [attributes, listeners, isDragging, isOverlay, t]
  );

  const handleSelectAll = () => {
    if (!onTaskSelect || !setIsMultiSelectMode || tasks.length === 0) return;

    setIsMultiSelectMode(true);
    // Select all tasks in this list
    tasks.forEach((task) => {
      if (selectedTasks?.has(task.id)) return;

      const fakeEvent = {
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        preventDefault: () => {},
        stopPropagation: () => {},
      } as React.MouseEvent;

      onTaskSelect(task.id, fakeEvent);
    });
  };

  if (isExternalCollapsed) {
    return (
      <Card
        ref={composedRef}
        style={style}
        className={cn(
          'group flex h-full w-14 shrink-0 snap-start scroll-mr-[var(--kanban-snap-right-padding)] scroll-ml-[var(--kanban-snap-left-padding)] flex-col items-center rounded-xl border border-dynamic-cyan/45 border-dashed bg-dynamic-cyan/[0.035] py-3 transition-all duration-200',
          'touch-none select-none hover:shadow-md'
        )}
      >
        <button
          type="button"
          className="flex h-full w-full flex-col items-center gap-3 rounded-lg px-1 text-dynamic-cyan transition-colors hover:bg-dynamic-cyan/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dynamic-cyan/40"
          title={tTasks('expand_external_tasks')}
          aria-label={tTasks('expand_external_tasks')}
          onClick={() => onExternalTasksCollapsedChange?.(false)}
        >
          <ChevronRight className="h-4 w-4 shrink-0" />
          <Badge
            variant="secondary"
            className="h-5 min-w-5 justify-center px-1 text-[10px]"
          >
            {badgeCount}
          </Badge>
          <span
            className="max-h-48 truncate font-medium text-[11px]"
            style={{ writingMode: 'vertical-rl' }}
          >
            {translateListName(column.name)}
          </span>
        </button>
      </Card>
    );
  }

  return (
    <Card
      ref={composedRef}
      style={style}
      className={cn(
        'group flex h-full w-[var(--kanban-column-width)] shrink-0 snap-start scroll-mr-[var(--kanban-snap-right-padding)] scroll-ml-[var(--kanban-snap-left-padding)] flex-col rounded-xl transition-all duration-200 last:snap-end',
        'touch-none select-none',
        colorClass,
        isDragging &&
          'rotate-1 scale-[1.02] opacity-90 shadow-xl ring-2 ring-primary/20',
        isOverlay && 'shadow-2xl ring-2 ring-primary/30',
        'hover:shadow-md',
        // Visual feedback for invalid drop (dev only)
        DEV_MODE && isDragging && !isOverlay && 'ring-2 ring-red-400/60',
        isExternalStaging
          ? 'border border-dynamic-cyan/45 border-dashed bg-dynamic-cyan/[0.035]'
          : 'border-0'
      )}
    >
      <div className="flex items-center gap-2 rounded-t-xl border-b p-3">
        {!isExternalStaging && DragHandle}
        <div className="flex flex-1 items-center gap-2">
          <span className="text-sm">{statusIcon}</span>
          <h3
            className={cn(
              'font-semibold text-foreground/90 text-sm',
              isExternalStaging
                ? 'cursor-default'
                : 'cursor-pointer hover:underline'
            )}
            onClick={() => {
              if (!isExternalStaging) setIsEditOpen(true);
            }}
            title={isExternalStaging ? undefined : t('edit_list')}
          >
            {translateListName(column.name)}
          </h3>
          <Badge
            variant="secondary"
            className={cn(
              'px-2 py-0.5 font-medium text-xs',
              badgeCount === 0 ? 'text-muted-foreground' : 'text-foreground'
            )}
          >
            {badgeCount}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {isExternalStaging ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-7 w-7 p-0 text-dynamic-cyan hover:bg-dynamic-cyan/10"
              title={tTasks('collapse_external_tasks')}
              aria-label={tTasks('collapse_external_tasks')}
              onClick={() => onExternalTasksCollapsedChange?.(true)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <ListActions
              listId={column.id}
              listName={column.name}
              listStatus={column.status}
              listColor={column.color as SupportedColor}
              tasks={tasks}
              boardId={boardId}
              wsId={wsId}
              onUpdate={handleUpdate}
              onSelectAll={handleSelectAll}
              isEditOpen={isEditOpen}
              onEditOpenChange={setIsEditOpen}
            />
          )}
        </div>
      </div>

      {/* Column content: skeleton during initial load, tasks after */}
      {isInitialLoad ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <VirtualizedTaskList
          tasks={tasks}
          availableLists={availableLists}
          column={column}
          boardId={boardId}
          workspaceId={workspaceId ?? wsId}
          onUpdate={handleUpdate}
          isMultiSelectMode={isMultiSelectMode}
          selectedTasks={selectedTasks}
          isPersonalWorkspace={isPersonalWorkspace}
          onTaskSelect={onTaskSelect}
          onClearSelection={onClearSelection}
          dragPreviewPosition={dragPreviewPosition}
          taskHeightsRef={taskHeightsRef}
          optimisticUpdateInProgress={optimisticUpdateInProgress}
          bulkUpdateCustomDueDate={bulkUpdateCustomDueDate}
          onLoadMore={handleLoadMore}
          hasMore={listState?.hasMore ?? false}
          isLoadingMore={listState?.isLoading ?? false}
        />
      )}

      <div className="rounded-b-xl border-t p-3 backdrop-blur-sm">
        {isExternalStaging ? (
          <div className="flex items-center gap-2 rounded-lg border border-dynamic-cyan/35 border-dashed bg-dynamic-cyan/8 px-3 py-2 text-dynamic-cyan text-xs">
            <MoveRight className="h-3.5 w-3.5 shrink-0" />
            <span className="leading-snug">
              {tTasks('external_tasks_drag_affordance')}
            </span>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onAddTask
                ? onAddTask(column)
                : createTask(boardId, column.id, [column], filters)
            }
            className="w-full justify-start rounded-lg border border-dynamic-gray/40 border-dashed text-muted-foreground text-xs transition-all hover:border-dynamic-gray/60 hover:bg-muted/40 hover:text-foreground"
          >
            + {t('add_task')}
          </Button>
        )}
      </div>
    </Card>
  );
}
