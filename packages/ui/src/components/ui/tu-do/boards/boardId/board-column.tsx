import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  GripVertical,
  Loader2,
  Pin,
  PinOff,
  RotateCcw,
} from '@tuturuuu/icons';
import type { ExternalTaskSortBy } from '@tuturuuu/internal-api/tasks';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTaskDialog } from '../../hooks/useTaskDialog';
import {
  type ListPaginationState,
  useProgressiveLoader,
} from '../../shared/progressive-loader-context';
import { getListTextColorClass } from '../../utils/taskColorUtils';
import { normalizeBoardText } from './board-text-utils';
import type { DragPreviewPosition } from './kanban/dnd/use-kanban-dnd';
import {
  isClosedTaskListColumnCollapsed,
  isKanbanColumnCollapsed,
} from './kanban/kanban-column-collapse';
import { ListActions } from './list-actions';
import { statusIcons } from './status-section';
import type { TaskCardAssigneeMemberSource } from './task-card/task-card';
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

const DEFAULT_EXTERNAL_TASK_SORT_BY: ExternalTaskSortBy = 'created-desc';
const TERMINAL_EXTERNAL_SOURCE_STATUSES = new Set(['done', 'closed']);

function getTaskTime(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function compareNullableTaskTime(
  a: string | null | undefined,
  b: string | null | undefined,
  ascending: boolean
) {
  const aTime = getTaskTime(a);
  const bTime = getTaskTime(b);

  if (aTime === null && bTime === null) return 0;
  if (aTime === null) return 1;
  if (bTime === null) return -1;

  return ascending ? aTime - bTime : bTime - aTime;
}

function getExternalSourceSortText(task: Task) {
  return [
    task.source_workspace_name,
    task.source_board_name,
    task.source_list_name,
    task.name,
  ]
    .filter(Boolean)
    .join(' / ')
    .toLowerCase();
}

function sortExternalTasks(tasks: Task[], sortBy: ExternalTaskSortBy) {
  const sorted = [...tasks];

  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'created-asc':
        return (
          compareNullableTaskTime(a.created_at, b.created_at, true) ||
          a.name.localeCompare(b.name)
        );
      case 'due-asc':
        return (
          compareNullableTaskTime(a.end_date, b.end_date, true) ||
          compareNullableTaskTime(a.created_at, b.created_at, false) ||
          a.name.localeCompare(b.name)
        );
      case 'name-asc':
        return (
          a.name.localeCompare(b.name) ||
          compareNullableTaskTime(a.created_at, b.created_at, false)
        );
      case 'source-asc':
        return (
          getExternalSourceSortText(a).localeCompare(
            getExternalSourceSortText(b)
          ) || compareNullableTaskTime(a.created_at, b.created_at, false)
        );
      default:
        return (
          compareNullableTaskTime(a.created_at, b.created_at, false) ||
          a.name.localeCompare(b.name)
        );
    }
  });

  return sorted;
}

export function shouldStartInitialColumnLoad({
  hasElement,
  listState,
}: {
  hasElement: boolean;
  listState?: ListPaginationState;
}) {
  return hasElement && !listState;
}

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
  canUseBoardAssignees?: boolean;
  assigneeMemberSource?: TaskCardAssigneeMemberSource;
  onTaskSelect?: (taskId: string, event: React.MouseEvent) => void;
  onClearSelection?: () => void;
  onAddTask?: (list: TaskList) => void;
  dragPreviewPosition?: DragPreviewPosition | null;
  suppressTaskTransforms?: boolean;
  taskHeightsRef?: React.MutableRefObject<Map<string, number>>;
  optimisticUpdateInProgress?: Set<string>;
  filters?: TaskFilters;
  bulkUpdateCustomDueDate?: (date: Date | null) => Promise<void>;
  workspaceId?: string;
  wsId: string;
  onExternalTasksCollapsedChange?: (collapsed: boolean) => void;
  onTaskListCollapsedChange?: (listId: string, collapsed: boolean) => void;
  specialPinned?: boolean;
  specialStickyOffset?: string;
  onSpecialPinnedChange?: (pinned: boolean) => void;
  readOnly?: boolean;
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
  canUseBoardAssignees,
  assigneeMemberSource,
  onAddTask,
  dragPreviewPosition,
  suppressTaskTransforms,
  taskHeightsRef,
  optimisticUpdateInProgress,
  filters,
  bulkUpdateCustomDueDate,
  workspaceId,
  wsId,
  onExternalTasksCollapsedChange,
  onTaskListCollapsedChange,
  specialPinned = false,
  specialStickyOffset,
  onSpecialPinnedChange,
  readOnly = false,
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
  const isInitialLoad = readOnly
    ? false
    : !listState || listState.isInitialLoad;
  const [externalIncludeDocuments, setExternalIncludeDocuments] =
    useState(false);
  const [externalIncludeDoneClosed, setExternalIncludeDoneClosed] =
    useState(false);
  const [externalSortBy, setExternalSortBy] = useState<ExternalTaskSortBy>(
    DEFAULT_EXTERNAL_TASK_SORT_BY
  );
  const isClosedCollapsed = isClosedTaskListColumnCollapsed(column);
  const isColumnCollapsed = isKanbanColumnCollapsed(column);
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
  const externalOptionsSignature = `${externalIncludeDocuments}:${externalIncludeDoneClosed}:${externalSortBy}`;
  const loadedExternalOptionsSignatureRef = useRef<string | null>(null);
  const externalLoadOptions = useMemo(
    () =>
      isExternalStaging
        ? {
            externalIncludeDocuments,
            externalIncludeDoneClosed,
            externalSortBy,
          }
        : undefined,
    [
      externalIncludeDocuments,
      externalIncludeDoneClosed,
      externalSortBy,
      isExternalStaging,
    ]
  );
  const loadColumnPage = useCallback(
    (page: number) => {
      if (!isExternalStaging) {
        return loadListPage(column.id, page);
      }

      loadedExternalOptionsSignatureRef.current = externalOptionsSignature;
      const promise = loadListPage(column.id, page, externalLoadOptions);

      void promise.catch(() => {});

      return promise;
    },
    [
      column.id,
      externalLoadOptions,
      externalOptionsSignature,
      isExternalStaging,
      loadListPage,
    ]
  );

  // Viewport detection — trigger first page load when column becomes visible
  const columnRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = columnRef.current;
    if (!shouldStartInitialColumnLoad({ hasElement: Boolean(el), listState })) {
      return;
    }

    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          loadColumnPage(0);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // Pre-fetch slightly before visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [listState, loadColumnPage]);

  useEffect(() => {
    if (
      !isExternalStaging ||
      isColumnCollapsed ||
      !listState ||
      listState.isInitialLoad ||
      listState.isLoading ||
      loadedExternalOptionsSignatureRef.current === externalOptionsSignature
    ) {
      return;
    }

    loadColumnPage(0);
  }, [
    externalOptionsSignature,
    isColumnCollapsed,
    isExternalStaging,
    listState,
    listState?.isInitialLoad,
    listState?.isLoading,
    loadColumnPage,
  ]);

  // Recovery path: if the list metadata says tasks exist but the shared tasks
  // cache was cleared, refetch page 0 for this list so cards reappear.
  useEffect(() => {
    if (
      isColumnCollapsed ||
      !listState ||
      listState.isLoading ||
      hasActiveFilters
    )
      return;

    if (listState.totalCount > 0 && tasks.length === 0) {
      if (recoveryRequestedRef.current) return;
      recoveryRequestedRef.current = true;
      loadColumnPage(0).finally(() => {
        recoveryRequestedRef.current = false;
      });
      return;
    }

    recoveryRequestedRef.current = false;
  }, [
    hasActiveFilters,
    isColumnCollapsed,
    listState,
    listState?.isLoading,
    listState?.totalCount,
    loadColumnPage,
    tasks.length,
  ]);

  // Load more pages (infinite scroll callback)
  const handleLoadMore = useCallback(() => {
    if (!listState || listState.isLoading || !listState.hasMore) return;
    loadColumnPage(listState.page + 1);
  }, [listState, loadColumnPage]);

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
    disabled: readOnly || isExternalStaging,
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
  const columnStyle: React.CSSProperties = specialStickyOffset
    ? {
        ...style,
        left: `calc(var(--kanban-snap-left-padding) + ${specialStickyOffset})`,
      }
    : style;

  const handleUpdate = () => {
    onUpdate?.();
  };

  const colorClass =
    colorClasses[column.color as SupportedColor] || colorClasses.GRAY;
  const statusIcon = statusIcons[column.status];
  const visibleTasks = useMemo(() => {
    if (!isExternalStaging) return tasks;

    const filteredTasks = tasks.filter((task) => {
      const sourceStatus = task.source_list_status;

      if (!externalIncludeDocuments && sourceStatus === 'documents') {
        return false;
      }

      if (
        !externalIncludeDoneClosed &&
        (task.completed_at ||
          task.closed_at ||
          (sourceStatus && TERMINAL_EXTERNAL_SOURCE_STATUSES.has(sourceStatus)))
      ) {
        return false;
      }

      return true;
    });

    return sortExternalTasks(filteredTasks, externalSortBy);
  }, [
    externalIncludeDocuments,
    externalIncludeDoneClosed,
    externalSortBy,
    isExternalStaging,
    tasks,
  ]);

  const badgeCount = listState
    ? listState.hasMore
      ? Math.max(listState.totalCount, visibleTasks.length)
      : visibleTasks.length
    : visibleTasks.length;
  const externalFilterCount =
    (externalIncludeDocuments ? 1 : 0) + (externalIncludeDoneClosed ? 1 : 0);
  const pinListLabel = specialPinned
    ? tTasks('unpin_task_list', { name: translateListName(column.name) })
    : tTasks('pin_task_list', { name: translateListName(column.name) });

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

  if (isColumnCollapsed) {
    const collapsedListName = translateListName(column.name);
    const expandLabel = isExternalCollapsed
      ? tTasks('expand_external_tasks')
      : tTasks('expand_task_list', { name: collapsedListName });
    const collapsedTextColor = isExternalCollapsed
      ? 'text-dynamic-cyan'
      : getListTextColorClass(column.color as SupportedColor);

    return (
      <Card
        ref={composedRef}
        style={columnStyle}
        data-kanban-pinned-special={specialStickyOffset ? 'true' : undefined}
        data-kanban-column-id={column.id}
        data-kanban-real-column={isExternalStaging ? undefined : 'true'}
        className={cn(
          'group flex h-full w-14 shrink-0 snap-start flex-col items-center rounded-xl border border-dashed transition-all duration-200',
          'touch-none select-none overflow-hidden hover:shadow-md',
          specialStickyOffset && 'sticky z-30',
          isExternalCollapsed
            ? 'border-dynamic-cyan/45 bg-dynamic-cyan/[0.035]'
            : colorClass
        )}
      >
        <button
          type="button"
          className={cn(
            'flex h-full w-full flex-col items-center gap-3 rounded-xl px-1 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2',
            isExternalCollapsed
              ? 'text-dynamic-cyan hover:bg-dynamic-cyan/10 focus-visible:ring-dynamic-cyan/40'
              : `${collapsedTextColor} hover:bg-muted/40 focus-visible:ring-primary/40`
          )}
          title={expandLabel}
          aria-label={expandLabel}
          onClick={() => {
            if (isExternalCollapsed) {
              onExternalTasksCollapsedChange?.(false);
              return;
            }

            onTaskListCollapsedChange?.(column.id, false);
          }}
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
            {collapsedListName}
          </span>
        </button>
      </Card>
    );
  }

  return (
    <Card
      ref={composedRef}
      style={columnStyle}
      data-kanban-pinned-special={specialStickyOffset ? 'true' : undefined}
      data-kanban-column-id={column.id}
      data-kanban-real-column={isExternalStaging ? undefined : 'true'}
      className={cn(
        'group flex h-full w-[var(--kanban-column-width)] shrink-0 snap-start flex-col rounded-xl transition-all duration-200 last:snap-end',
        'touch-none select-none',
        specialStickyOffset && 'sticky z-30',
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
        {!readOnly && !isExternalStaging && DragHandle}
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
              if (!readOnly && !isExternalStaging) setIsEditOpen(true);
            }}
            title={readOnly || isExternalStaging ? undefined : t('edit_list')}
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
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className={cn(
                      'relative h-7 w-7 p-0 text-dynamic-cyan hover:bg-dynamic-cyan/10',
                      externalFilterCount > 0 && 'bg-dynamic-cyan/10'
                    )}
                    title={t('filters')}
                    aria-label={t('filters')}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    {externalFilterCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-dynamic-cyan px-0.5 font-medium text-[9px] text-background">
                        {externalFilterCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuCheckboxItem
                    checked={externalIncludeDoneClosed}
                    onCheckedChange={(checked) =>
                      setExternalIncludeDoneClosed(checked === true)
                    }
                    onSelect={(event) => event.preventDefault()}
                  >
                    <CheckCircle2 className="mr-2 h-3.5 w-3.5 text-dynamic-green" />
                    {tTasks('external_tasks_show_done_closed')}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={externalIncludeDocuments}
                    onCheckedChange={(checked) =>
                      setExternalIncludeDocuments(checked === true)
                    }
                    onSelect={(event) => event.preventDefault()}
                  >
                    <FileText className="mr-2 h-3.5 w-3.5 text-dynamic-blue" />
                    {tTasks('external_tasks_show_documents')}
                  </DropdownMenuCheckboxItem>
                  {externalFilterCount > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          setExternalIncludeDocuments(false);
                          setExternalIncludeDoneClosed(false);
                        }}
                      >
                        <RotateCcw className="mr-2 h-3.5 w-3.5" />
                        {t('reset')}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className={cn(
                      'h-7 w-7 p-0 text-dynamic-cyan hover:bg-dynamic-cyan/10',
                      externalSortBy !== DEFAULT_EXTERNAL_TASK_SORT_BY &&
                        'bg-dynamic-cyan/10'
                    )}
                    title={t('sort')}
                    aria-label={t('sort')}
                  >
                    {externalSortBy === 'created-asc' ? (
                      <ArrowUpAZ className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDownAZ className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuRadioGroup
                    value={externalSortBy}
                    onValueChange={(value) =>
                      setExternalSortBy(value as ExternalTaskSortBy)
                    }
                  >
                    <DropdownMenuRadioItem value="created-desc">
                      <ArrowDownAZ className="mr-2 h-3.5 w-3.5" />
                      {tTasks('external_tasks_sort_created_desc')}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="created-asc">
                      <ArrowUpAZ className="mr-2 h-3.5 w-3.5" />
                      {tTasks('external_tasks_sort_created_asc')}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="due-asc">
                      <CalendarClock className="mr-2 h-3.5 w-3.5" />
                      {tTasks('external_tasks_sort_due_asc')}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="name-asc">
                      <ArrowUpAZ className="mr-2 h-3.5 w-3.5" />
                      {tTasks('external_tasks_sort_name_asc')}
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="source-asc">
                      <ArrowUpAZ className="mr-2 h-3.5 w-3.5" />
                      {tTasks('external_tasks_sort_source_asc')}
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              {onSpecialPinnedChange ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className={cn(
                    'h-7 w-7 p-0 text-dynamic-cyan hover:bg-dynamic-cyan/10',
                    specialPinned && 'bg-dynamic-cyan/10'
                  )}
                  title={pinListLabel}
                  aria-label={pinListLabel}
                  onClick={() => onSpecialPinnedChange(!specialPinned)}
                >
                  {specialPinned ? (
                    <PinOff className="h-3.5 w-3.5" />
                  ) : (
                    <Pin className="h-3.5 w-3.5" />
                  )}
                </Button>
              ) : null}
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
            </>
          ) : (
            <>
              {isClosedCollapsed || column.status === 'closed' ? (
                <>
                  {onSpecialPinnedChange ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className={cn(
                        'h-7 w-7 p-0 hover:bg-muted/40',
                        getListTextColorClass(column.color as SupportedColor),
                        specialPinned && 'bg-muted/40'
                      )}
                      title={pinListLabel}
                      aria-label={pinListLabel}
                      onClick={() => onSpecialPinnedChange(!specialPinned)}
                    >
                      {specialPinned ? (
                        <PinOff className="h-3.5 w-3.5" />
                      ) : (
                        <Pin className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className={cn(
                      'h-7 w-7 p-0 hover:bg-muted/40',
                      getListTextColorClass(column.color as SupportedColor)
                    )}
                    title={tTasks('collapse_task_list', {
                      name: translateListName(column.name),
                    })}
                    aria-label={tTasks('collapse_task_list', {
                      name: translateListName(column.name),
                    })}
                    onClick={() => onTaskListCollapsedChange?.(column.id, true)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : null}
              {!readOnly && (
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
            </>
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
          tasks={visibleTasks}
          availableLists={availableLists}
          column={column}
          boardId={boardId}
          workspaceId={workspaceId ?? wsId}
          onUpdate={handleUpdate}
          isMultiSelectMode={isMultiSelectMode}
          selectedTasks={selectedTasks}
          isPersonalWorkspace={isPersonalWorkspace}
          canUseBoardAssignees={canUseBoardAssignees}
          assigneeMemberSource={assigneeMemberSource}
          onTaskSelect={onTaskSelect}
          onClearSelection={onClearSelection}
          dragPreviewPosition={dragPreviewPosition}
          suppressSortableTransform={suppressTaskTransforms}
          taskHeightsRef={taskHeightsRef}
          optimisticUpdateInProgress={optimisticUpdateInProgress}
          bulkUpdateCustomDueDate={bulkUpdateCustomDueDate}
          onLoadMore={handleLoadMore}
          hasMore={listState?.hasMore ?? false}
          isLoadingMore={listState?.isLoading ?? false}
          readOnly={readOnly}
        />
      )}

      {!readOnly && !isExternalStaging && (
        <div className="rounded-b-xl border-t p-3 backdrop-blur-sm">
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
        </div>
      )}
    </Card>
  );
}
