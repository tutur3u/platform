import {
  ArrowDownAZ,
  ArrowLeft,
  ArrowUpAZ,
  CalendarDays,
  Clock,
  CopyCheck,
  Flag,
  Gauge,
  KanbanSquare,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  Search,
  Settings,
  Share2,
  Trash2,
  X,
  Zap,
} from '@tuturuuu/icons';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { BoardShareDialog } from '../boards/board-share-dialog';
import { KanbanPlannerDialog } from '../boards/boardId/kanban/planner/kanban-planner-dialog';
import { TaskFilter, type TaskFilters } from '../boards/boardId/task-filter';
import { saveBoardConfig } from './board-config-storage';
import { BoardSwitcher } from './board-switcher';
import { BoardUserPresenceAvatarsComponent } from './board-user-presence-avatars';
import type { ViewType } from './board-views';
import type { BoardFiltersMetadata } from './task-filter.types';

export type ListStatusFilter = 'all' | 'active' | 'not_started';

interface Props {
  workspaceId: string;
  board: Pick<
    WorkspaceTaskBoard,
    'id' | 'name' | 'ticket_prefix' | 'archived_at'
  > & {
    ws_id?: WorkspaceTaskBoard['ws_id'] | null;
    icon?: WorkspaceTaskBoard['icon'];
    default_list_id?: WorkspaceTaskBoard['default_list_id'] | null;
  };
  currentUserId?: string;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  viewHotkeyLabels?: Partial<Record<ViewType, string>>;
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  listStatusFilter: ListStatusFilter;
  onListStatusFilterChange: (filter: ListStatusFilter) => void;
  isPersonalWorkspace: boolean;
  backUrl?: string;
  hideActions?: boolean;
  isSearching?: boolean;
  lists?: TaskList[];
  onUpdate?: () => void;
  onRecycleBinOpen?: () => void;
  isMultiSelectMode: boolean;
  setIsMultiSelectMode: (enabled: boolean) => void;
  availableViews?: ViewType[];
  publicView?: boolean;
  readOnly?: boolean;
  titlePrefix?: ReactNode;
}

export function BoardHeader({
  workspaceId,
  board,
  currentUserId,
  currentView,
  onViewChange,
  viewHotkeyLabels,
  filters,
  onFiltersChange,
  listStatusFilter,
  onListStatusFilterChange,
  isPersonalWorkspace,
  backUrl,
  hideActions = false,
  isSearching = false,
  isMultiSelectMode,
  setIsMultiSelectMode,
  availableViews,
  publicView = false,
  readOnly = false,
  titlePrefix,
}: Props) {
  const t = useTranslations();
  const [isLoading, setIsLoading] = useState(false);
  const [shareBoardOpen, setShareBoardOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [localSearchQuery, setLocalSearchQuery] = useState(
    filters.searchQuery || ''
  );
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const enabledViews = availableViews ?? ['kanban', 'list', 'timeline'];
  const activeView = enabledViews.includes(currentView)
    ? currentView
    : (enabledViews[0] ?? 'kanban');
  const interactiveControlsVisible = !readOnly;
  const managerControlsVisible = !hideActions && !readOnly;
  const plannerVisible =
    interactiveControlsVisible &&
    !publicView &&
    isPersonalWorkspace &&
    currentView === 'kanban';

  // Stable refs for callbacks and values to avoid effect re-runs
  const onFiltersChangeRef = useRef(onFiltersChange);
  const onListStatusFilterChangeRef = useRef(onListStatusFilterChange);
  const onViewChangeRef = useRef(onViewChange);
  const filtersRef = useRef(filters);

  // Update refs on each render
  useEffect(() => {
    onFiltersChangeRef.current = onFiltersChange;
    onListStatusFilterChangeRef.current = onListStatusFilterChange;
    onViewChangeRef.current = onViewChange;
    filtersRef.current = filters;
  });

  // Sync local search query with external filter changes
  useEffect(() => {
    const newQuery = filters.searchQuery || '';
    // Use functional updater to compare current state and only update if different
    // This prevents overwriting in-progress typing
    setLocalSearchQuery((current) =>
      current === newQuery ? current : newQuery
    );
  }, [filters.searchQuery]);

  // Debounce search query updates
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const currentFilters = filtersRef.current;
      if (localSearchQuery !== (currentFilters.searchQuery || '')) {
        onFiltersChangeRef.current({
          ...currentFilters,
          searchQuery: localSearchQuery || undefined,
        });

        // Auto-switch to List view when searching in Timeline view
        if (localSearchQuery && currentView === 'timeline') {
          onViewChangeRef.current('list');
        }
      }
    }, 300); // 300ms debounce delay

    return () => clearTimeout(timeoutId);
  }, [localSearchQuery, currentView]);

  // Save board configuration to localStorage when it changes (excluding search)
  useEffect(() => {
    // Debounce the save operation to avoid excessive writes
    const timeoutId = setTimeout(() => {
      const { searchQuery: _, ...filtersToSave } = filters;
      saveBoardConfig(board.id, {
        currentView,
        filters: filtersToSave,
        listStatusFilter,
      });
    }, 500); // 500ms debounce delay

    return () => clearTimeout(timeoutId);
  }, [board.id, currentView, filters, listStatusFilter]);

  function handleSortChange(sortBy: TaskFilters['sortBy']) {
    onFiltersChange({ ...filters, sortBy });
  }

  function openBoardSettings() {
    const params = new URLSearchParams(searchParams.toString());
    params.set('settingsDialog', 'open');
    params.set('settingsTab', 'task_board');
    params.set('settingsBoardId', board.id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleSmartFocus() {
    setIsLoading(true);

    // Check if currently "focused"
    const isFocused =
      listStatusFilter === 'active' &&
      filters.includeMyTasks &&
      filters.sortBy === 'priority-high';

    if (isFocused) {
      // Toggle OFF: Reset defaults
      onListStatusFilterChange('all');

      const resetFilters: TaskFilters = {
        ...filters,
        includeMyTasks: false,
        includeUnassigned: false,
        sortBy: undefined,
      };

      onFiltersChange(resetFilters);
    } else {
      // Toggle ON: Apply focus
      onListStatusFilterChange('active');

      const newFilters: TaskFilters = {
        ...filters,
        includeMyTasks: true,
        includeUnassigned: false,
        sortBy: 'priority-high',
      };

      onFiltersChange(newFilters);
    }

    // Small delay to show feedback if needed, but mostly instant
    setTimeout(() => setIsLoading(false), 300);
  }

  // Derived state for button UI
  const isSmartFocusActive =
    listStatusFilter === 'active' &&
    filters.includeMyTasks &&
    filters.sortBy === 'priority-high';

  const viewConfig = {
    kanban: {
      icon: KanbanSquare,
      label: t('ws-task-boards.views.kanban'),
      description: t('ws-task-boards.views.kanban_description'),
    },
    list: {
      icon: List,
      label: t('ws-task-boards.views.list'),
      description: t('ws-task-boards.views.list_description'),
    },
    timeline: {
      icon: CalendarDays,
      label: t('ws-task-boards.views.timeline'),
      description: t('ws-task-boards.views.timeline_description'),
    },
    drafts: {
      icon: Pencil,
      label: t('task-drafts.title'),
      description: t('task-drafts.empty_description'),
    },
    recycle_bin: {
      icon: Trash2,
      label: t('common.recycle_bin'),
      description: t('common.recycle_bin_description'),
    },
  };
  const viewOptions = Object.entries(viewConfig).filter(([view]) =>
    enabledViews.includes(view as ViewType)
  );
  const listStatusOptions = [
    {
      value: 'all',
      label: t('common.all'),
      icon: <LayoutGrid className="h-3.5 w-3.5 text-foreground" />,
    },
    {
      value: 'active',
      label: t('common.active'),
      icon: <Play className="h-3.5 w-3.5 text-dynamic-green" />,
    },
    {
      value: 'not_started',
      label: t('common.backlog'),
      icon: <Clock className="h-3.5 w-3.5 text-dynamic-orange" />,
    },
  ];
  const viewComboboxOptions = viewOptions.map(([view, config]) => {
    const Icon = config.icon;
    const hotkeyLabel = viewHotkeyLabels?.[view as ViewType];

    return {
      value: view,
      label: config.label,
      description: config.description,
      icon: <Icon className="h-3.5 w-3.5" />,
      badge: hotkeyLabel ? (
        <span className="text-muted-foreground text-xs">{hotkeyLabel}</span>
      ) : undefined,
    };
  });
  const sortOptions = [
    {
      value: '__none__',
      label: t('common.sort'),
      description: filters.sortBy
        ? t('ws-task-boards.filters.sort_options.clear_sorting')
        : undefined,
      icon: <ArrowUpAZ className="h-3.5 w-3.5 text-muted-foreground" />,
      muted: !filters.sortBy,
    },
    {
      value: 'name-asc',
      label: `${t('ws-task-boards.filters.sort.name')} · ${t(
        'ws-task-boards.filters.sort_order.asc'
      )}`,
      icon: <ArrowUpAZ className="h-3.5 w-3.5 text-dynamic-blue" />,
    },
    {
      value: 'name-desc',
      label: `${t('ws-task-boards.filters.sort.name')} · ${t(
        'ws-task-boards.filters.sort_order.desc'
      )}`,
      icon: <ArrowDownAZ className="h-3.5 w-3.5 text-dynamic-purple" />,
    },
    {
      value: 'priority-high',
      label: t('ws-task-boards.filters.sort_options.high_to_low'),
      description: t('ws-task-boards.filters.sort_options.priority'),
      icon: <Flag className="h-3.5 w-3.5 text-dynamic-red" />,
    },
    {
      value: 'priority-low',
      label: t('ws-task-boards.filters.sort_options.low_to_high'),
      description: t('ws-task-boards.filters.sort_options.priority'),
      icon: <Flag className="h-3.5 w-3.5 text-dynamic-gray" />,
    },
    {
      value: 'due-date-asc',
      label: t('ws-task-boards.filters.sort_options.soonest_first'),
      description: t('ws-task-boards.filters.sort_options.due_date'),
      icon: <CalendarDays className="h-3.5 w-3.5 text-dynamic-orange" />,
    },
    {
      value: 'due-date-desc',
      label: t('ws-task-boards.filters.sort_options.latest_first'),
      description: t('ws-task-boards.filters.sort_options.due_date'),
      icon: <CalendarDays className="h-3.5 w-3.5 text-dynamic-blue" />,
    },
    {
      value: 'created-date-desc',
      label: t('ws-task-boards.filters.sort_options.newest_first'),
      description: t('ws-task-boards.filters.sort.created_at'),
      icon: <Clock className="h-3.5 w-3.5 text-dynamic-green" />,
    },
    {
      value: 'created-date-asc',
      label: t('ws-task-boards.filters.sort_options.oldest_first'),
      description: t('ws-task-boards.filters.sort.created_at'),
      icon: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
    },
    {
      value: 'estimation-high',
      label: t('ws-task-boards.filters.sort_options.highest_first'),
      description: t('ws-task-boards.filters.sort_options.estimate'),
      icon: <Gauge className="h-3.5 w-3.5 text-dynamic-purple" />,
    },
    {
      value: 'estimation-low',
      label: t('ws-task-boards.filters.sort_options.lowest_first'),
      description: t('ws-task-boards.filters.sort_options.estimate'),
      icon: <Gauge className="h-3.5 w-3.5 text-dynamic-cyan" />,
    },
  ];
  // Create metadata for presence tracking (excludes search query for stability)
  const presenceMetadata: BoardFiltersMetadata = useMemo(() => {
    const { searchQuery: _, ...filtersWithoutSearch } = filters;
    return {
      filters: filtersWithoutSearch,
      listStatusFilter,
    };
  }, [filters, listStatusFilter]);

  return (
    <div className="-mt-2 border-b p-2">
      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
        {/* Board Info */}
        <div className="flex min-w-0 items-center gap-2">
          {backUrl && (
            <Link
              href={backUrl}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          {publicView ? (
            <div className="flex min-w-0 items-center gap-2">
              {titlePrefix}
              <h1 className="truncate font-semibold text-foreground text-sm">
                {board.name || t('common.untitled')}
              </h1>
            </div>
          ) : (
            <BoardSwitcher
              board={{ ...board, ws_id: workspaceId }}
              translations={{
                loadingBoards: t('common.loading'),
                noOtherBoards: t('common.no_other_boards'),
                activeBoards: t('common.active_boards'),
                archivedBoards: t('common.archived_boards'),
                deletedBoards: t('common.deleted_boards'),
                untitled: t('common.untitled'),
                active: t('common.active'),
                archived: t('common.archived'),
                deleted: t('common.deleted'),
                daysLeft: t('common.days_left', { count: '{count}' }),
                searchBoards: t('common.search_boards'),
                tasks: t('common.tasks'),
              }}
            />
          )}
        </div>

        {/* Search Bar */}
        <div className="relative min-w-0 flex-1 basis-72">
          {isSearching ? (
            <Loader2 className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            <Search className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          )}
          <Input
            type="text"
            placeholder={t('common.search_tasks')}
            value={localSearchQuery}
            onChange={(e) => setLocalSearchQuery(e.target.value)}
            className="placeholder:-translate-0.5 h-6 bg-background pr-8 pl-8 text-xs placeholder:text-xs sm:h-8 sm:text-sm"
          />
          {localSearchQuery && !isSearching && (
            <button
              type="button"
              onClick={() => setLocalSearchQuery('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={t('common.clear_search')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Controls - Compact Row */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Online Users */}
          {interactiveControlsVisible && !isPersonalWorkspace && (
            <BoardUserPresenceAvatarsComponent
              boardId={board.id}
              currentMetadata={presenceMetadata}
              onFiltersChange={onFiltersChange}
              onListStatusFilterChange={onListStatusFilterChange}
            />
          )}

          {/* Smart Focus Button */}
          {interactiveControlsVisible && (
            <Button
              variant={isSmartFocusActive ? 'secondary' : 'outline'}
              size="xs"
              onClick={handleSmartFocus}
              disabled={isLoading}
              className={cn(
                'h-7 px-1.5 transition-colors sm:h-8 sm:px-2',
                isSmartFocusActive
                  ? 'border-dynamic-yellow/20 bg-dynamic-yellow/10 text-dynamic-yellow hover:bg-dynamic-yellow/20'
                  : 'text-muted-foreground hover:text-dynamic-yellow'
              )}
              title={
                isSmartFocusActive
                  ? t('common.clear_smart_focus')
                  : t('common.smart_focus')
              }
            >
              <Zap
                className={cn(
                  'h-3.5 w-3.5',
                  isSmartFocusActive && 'fill-current'
                )}
              />
            </Button>
          )}

          {/* Multi-select Toggle */}
          {interactiveControlsVisible && (
            <Button
              variant={isMultiSelectMode ? 'secondary' : 'outline'}
              size="xs"
              onClick={() => setIsMultiSelectMode(!isMultiSelectMode)}
              className={cn(
                'h-7 px-1.5 sm:h-8 sm:px-2',
                isMultiSelectMode &&
                  'bg-primary/10 text-primary hover:bg-primary/20'
              )}
              title={t('common.choose_tasks')}
            >
              <CopyCheck
                className={cn(
                  'h-3.5 w-3.5',
                  isMultiSelectMode && 'text-primary'
                )}
              />
            </Button>
          )}

          {/* List Status Filter */}
          <Combobox
            mode="single"
            options={listStatusOptions}
            selected={listStatusFilter}
            onChange={(value) =>
              onListStatusFilterChange(value as ListStatusFilter)
            }
            placeholder={t('common.all')}
            searchPlaceholder={t('common.search_tasks')}
            className={cn(
              'w-24 sm:w-28 [&_button]:h-7 [&_button]:px-2 [&_button]:text-[10px] sm:[&_button]:h-8 sm:[&_button]:text-xs',
              listStatusFilter !== 'all' &&
                '[&_button]:border-primary/50 [&_button]:bg-primary/5'
            )}
          />

          {/* View Switcher */}
          <Combobox
            mode="single"
            options={viewComboboxOptions}
            selected={activeView}
            onChange={(value) => onViewChange(value as ViewType)}
            placeholder={viewConfig[activeView].label}
            searchPlaceholder={t('common.search_tasks')}
            className="w-28 sm:w-32 [&_button]:h-7 [&_button]:px-2 [&_button]:text-[10px] sm:[&_button]:h-8 sm:[&_button]:text-xs"
          />

          {/* Task Filter */}
          {interactiveControlsVisible && (
            <TaskFilter
              wsId={workspaceId}
              currentUserId={currentUserId}
              filters={filters}
              onFiltersChange={onFiltersChange}
            />
          )}

          {/* Sort */}
          <Combobox
            mode="single"
            options={sortOptions}
            selected={filters.sortBy ?? '__none__'}
            onChange={(value) =>
              handleSortChange(
                value === '__none__'
                  ? undefined
                  : (value as TaskFilters['sortBy'])
              )
            }
            placeholder={t('common.sort')}
            searchPlaceholder={t('common.search_tasks')}
            className={cn(
              'w-24 sm:w-30 [&_button]:h-7 [&_button]:px-2 [&_button]:text-[10px] sm:[&_button]:h-8 sm:[&_button]:text-xs',
              filters.sortBy &&
                '[&_button]:border-primary/50 [&_button]:bg-primary/5'
            )}
          />

          {plannerVisible && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => setPlannerOpen(true)}
              title={t('ws-task-plans.planner')}
              aria-label={t('ws-task-plans.planner')}
            >
              <CalendarDays className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden text-[10px] sm:text-xs md:inline">
                {t('ws-task-plans.planner')}
              </span>
            </Button>
          )}

          {managerControlsVisible && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              onClick={() => setShareBoardOpen(true)}
              title={t('ws-task-boards.share.action')}
              aria-label={t('ws-task-boards.share.action')}
            >
              <Share2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span className="hidden text-[10px] sm:text-xs md:inline">
                {t('common.share')}
              </span>
            </Button>
          )}

          {/* Board Actions Menu */}
          {managerControlsVisible && (
            <DropdownMenu open={boardMenuOpen} onOpenChange={setBoardMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="xs"
                  className="h-7 px-1.5 text-muted-foreground sm:h-8 sm:px-2"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  <span className="sr-only">Open board menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-50">
                <DropdownMenuItem
                  onClick={() => {
                    openBoardSettings();
                    setBoardMenuOpen(false);
                  }}
                  className="gap-2"
                >
                  <Settings className="h-4 w-4" />
                  {t('ws-task-boards.actions.board_settings')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <BoardShareDialog
        board={{ id: board.id, name: board.name }}
        open={shareBoardOpen}
        onOpenChange={setShareBoardOpen}
        wsId={workspaceId}
      />
      {plannerVisible && (
        <KanbanPlannerDialog
          boardId={board.id}
          isPersonalWorkspace={isPersonalWorkspace}
          onOpenChange={setPlannerOpen}
          open={plannerOpen}
          workspaceId={workspaceId}
        />
      )}
    </div>
  );
}
