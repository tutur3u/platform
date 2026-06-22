import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowDownAZ,
  ArrowLeft,
  ArrowUpAZ,
  Bookmark,
  CalendarDays,
  Clock,
  Columns3Cog,
  Copy,
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
  RotateCcw,
  Search,
  Settings,
  Share2,
  Trash2,
  X,
  Zap,
} from '@tuturuuu/icons';
import {
  deleteWorkspaceTaskBoard,
  updateWorkspaceTaskBoard,
} from '@tuturuuu/internal-api';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useBoardActions } from '@tuturuuu/ui/hooks/use-board-actions';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { BoardShareDialog } from '../boards/board-share-dialog';
import { KanbanPlannerDialog } from '../boards/boardId/kanban/planner/kanban-planner-dialog';
import { TaskFilter, type TaskFilters } from '../boards/boardId/task-filter';
import { CopyBoardDialog } from '../boards/copy-board-dialog';
import { TaskBoardForm } from '../boards/form';
import { useTasksHref } from '../tasks-route-context';
import { SaveAsTemplateDialog } from '../templates/save-as-template-dialog';
import { saveBoardConfig } from './board-config-storage';
import { BoardLayoutSettings } from './board-layout-settings';
import { syncBoardTicketPrefixCaches } from './board-query-cache';
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
  lists = [],
  onUpdate,
  onRecycleBinOpen,
  isMultiSelectMode,
  setIsMultiSelectMode,
  availableViews,
  publicView = false,
  readOnly = false,
  titlePrefix,
}: Props) {
  const t = useTranslations();
  const [isLoading, setIsLoading] = useState(false);
  const [editBoardOpen, setEditBoardOpen] = useState(false);
  const [duplicateBoardOpen, setDuplicateBoardOpen] = useState(false);
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false);
  const [shareBoardOpen, setShareBoardOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [layoutSettingsOpen, setLayoutSettingsOpen] = useState(false);
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showUnarchiveDialog, setShowUnarchiveDialog] = useState(false);
  const [ticketPrefix, setTicketPrefix] = useState(board.ticket_prefix || '');
  const [defaultListId, setDefaultListId] = useState<string | null>(
    board.default_list_id ?? null
  );
  const [localSearchQuery, setLocalSearchQuery] = useState(
    filters.searchQuery || ''
  );
  const { archiveBoard, unarchiveBoard } = useBoardActions(workspaceId);
  const queryClient = useQueryClient();
  const router = useRouter();
  const tasksHref = useTasksHref();
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

  async function handleDelete() {
    try {
      setIsLoading(true);
      await deleteWorkspaceTaskBoard(workspaceId, board.id);
      router.push(`/${workspaceId}${tasksHref('/boards')}`);
    } catch (error) {
      console.error('Failed to delete board:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveTicketPrefix() {
    try {
      setIsLoading(true);

      // Validate and clean the prefix
      const cleanedPrefix = ticketPrefix.trim().toUpperCase();
      const nextTicketPrefix = cleanedPrefix || null;

      await updateWorkspaceTaskBoard(workspaceId, board.id, {
        ticket_prefix: nextTicketPrefix,
        default_list_id: defaultListId,
      });

      syncBoardTicketPrefixCaches({
        queryClient,
        workspaceId,
        board,
        ticketPrefix: nextTicketPrefix,
      });

      setBoardSettingsOpen(false);

      // Invalidate relevant caches
      queryClient.invalidateQueries({
        queryKey: ['task-board', workspaceId, board.id],
      });
      queryClient.invalidateQueries({
        queryKey: ['board-config', workspaceId, board.id],
      });

      // Trigger parent update
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to update ticket prefix:', error);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSortChange(sortBy: TaskFilters['sortBy']) {
    onFiltersChange({ ...filters, sortBy });
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
  const defaultListOptions = [
    {
      value: '__none__',
      label: t('ws-task-boards.settings.default_list_none'),
    },
    ...lists
      .filter((list) => !list.deleted && !list.is_external_staging)
      .map((list) => ({
        value: list.id,
        label: list.name || t('ws-task-boards.settings.untitled_list'),
      })),
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
                    setEditBoardOpen(true);
                    setBoardMenuOpen(false);
                  }}
                  className="gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  {t('common.edit')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setDuplicateBoardOpen(true);
                    setBoardMenuOpen(false);
                  }}
                  className="gap-2"
                >
                  <Copy className="h-4 w-4" />
                  {t('ws-task-boards.actions.duplicate')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setSaveAsTemplateOpen(true);
                    setBoardMenuOpen(false);
                  }}
                  className="gap-2"
                >
                  <Bookmark className="h-4 w-4" />
                  {t('ws-task-boards.actions.save_as_template')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setLayoutSettingsOpen(true);
                    setBoardMenuOpen(false);
                  }}
                  className="gap-2"
                >
                  <Columns3Cog className="h-4 w-4" />
                  {t('ws-task-boards.actions.board_layout')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setTicketPrefix(board.ticket_prefix || '');
                    setDefaultListId(board.default_list_id ?? null);
                    setBoardSettingsOpen(true);
                    setBoardMenuOpen(false);
                  }}
                  className="gap-2"
                >
                  <Settings className="h-4 w-4" />
                  {t('ws-task-boards.actions.board_settings')}
                </DropdownMenuItem>
                {(onRecycleBinOpen || board.archived_at) && (
                  <DropdownMenuSeparator />
                )}
                {onRecycleBinOpen && (
                  <DropdownMenuItem
                    onClick={() => {
                      onRecycleBinOpen();
                      setBoardMenuOpen(false);
                    }}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('ws-task-boards.actions.recycle_bin')}
                  </DropdownMenuItem>
                )}
                {board.archived_at ? (
                  <DropdownMenuItem
                    onClick={() => {
                      setShowUnarchiveDialog(true);
                      setBoardMenuOpen(false);
                    }}
                    className="gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t('ws-task-boards.row_actions.unarchive')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() => {
                      setShowArchiveDialog(true);
                      setBoardMenuOpen(false);
                    }}
                    className="gap-2"
                  >
                    <Archive className="h-4 w-4" />
                    {t('ws-task-boards.row_actions.archive')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem
                      onSelect={(e) => e.preventDefault()}
                      className="gap-2 text-dynamic-red/80 focus:text-dynamic-red"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('ws-task-boards.actions.delete_board')}
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {t('common.are_you_sure')}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('ws-task-boards.dialog.delete_board_confirmation', {
                          name: board.name || '',
                        })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isLoading}>
                        {t('common.cancel')}
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={isLoading}
                        className="bg-dynamic-red/90 text-white hover:bg-dynamic-red"
                      >
                        {isLoading
                          ? t('common.deleting')
                          : t('ws-task-boards.actions.delete_board')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {/* Edit Board (name + icon) Dialog */}
      <Dialog open={editBoardOpen} onOpenChange={setEditBoardOpen}>
        <DialogContent className="p-0 sm:max-w-lg">
          <DialogHeader className="sr-only">
            <DialogTitle>{t('ws-task-boards.edit_dialog.title')}</DialogTitle>
            <DialogDescription>
              {t('ws-task-boards.edit_dialog.description')}
            </DialogDescription>
          </DialogHeader>
          <TaskBoardForm
            wsId={workspaceId}
            data={{
              id: board.id,
              name: board.name ?? '',
              icon: board.icon ?? null,
            }}
            showCancel
            onCancel={() => setEditBoardOpen(false)}
            onFinish={() => {
              setEditBoardOpen(false);
              queryClient.invalidateQueries({
                queryKey: ['task-board', workspaceId, board.id],
              });
              queryClient.invalidateQueries({
                queryKey: ['other-boards', workspaceId, board.id],
              });
            }}
          />
        </DialogContent>
      </Dialog>
      {/* Duplicate Board Dialog */}
      <CopyBoardDialog
        board={{ id: board.id, ws_id: workspaceId, name: board.name }}
        open={duplicateBoardOpen}
        onOpenChange={setDuplicateBoardOpen}
      />
      {/* Save as Template Dialog */}
      <SaveAsTemplateDialog
        board={{ id: board.id, ws_id: workspaceId, name: board.name }}
        open={saveAsTemplateOpen}
        onOpenChange={setSaveAsTemplateOpen}
      />
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
      {/* Board Layout Settings */}
      {onUpdate && (
        <BoardLayoutSettings
          open={layoutSettingsOpen}
          onOpenChange={setLayoutSettingsOpen}
          boardId={board.id}
          wsId={workspaceId}
          lists={lists}
          onUpdate={onUpdate}
          translations={{
            boardLayoutSettings: t('ws-task-boards.layout_settings.title'),
            boardLayoutSettingsDescription: t(
              'ws-task-boards.layout_settings.description'
            ),
            addNewList: t('ws-task-boards.layout_settings.add_new_list'),
            noListsInStatus: t('ws-task-boards.layout_settings.no_lists'),
            done: t('common.done'),
            editList: t('ws-task-boards.layout_settings.edit_list'),
            updateListDescription: t(
              'ws-task-boards.layout_settings.edit_list_description'
            ),
            listName: t('ws-task-boards.layout_settings.list_name'),
            statusCategory: t('ws-task-boards.layout_settings.status_category'),
            color: t('common.color'),
            cancel: t('common.cancel'),
            saving: t('common.saving'),
            saveChanges: t('common.save_changes'),
            deleteListTitle: t('ws-task-boards.layout_settings.delete_list'),
            deleteListDescription: t(
              'ws-task-boards.layout_settings.delete_list_description',
              { name: '{name}' }
            ),
            deleteListConfirm: t('ws-task-boards.layout_settings.delete_list'),
            listUpdatedSuccessfully: t(
              'ws-task-boards.layout_settings.list_updated'
            ),
            failedToUpdateList: t(
              'ws-task-boards.layout_settings.failed_to_update'
            ),
            listNameAlreadyExists: t(
              'ws-task-boards.layout_settings.list_name_exists'
            ),
            colorUpdated: t('ws-task-boards.layout_settings.color_updated'),
            failedToUpdateColor: t(
              'ws-task-boards.layout_settings.failed_to_update_color'
            ),
            listDeletedSuccessfully: t(
              'ws-task-boards.layout_settings.list_deleted'
            ),
            failedToDeleteList: t(
              'ws-task-boards.layout_settings.failed_to_delete'
            ),
            cannotMoveToClosedStatus: t(
              'ws-task-boards.layout_settings.cannot_move_to_closed'
            ),
            listsReordered: t('ws-task-boards.layout_settings.lists_reordered'),
            failedToReorderLists: t(
              'ws-task-boards.layout_settings.failed_to_reorder'
            ),
            task: t('common.task'),
            tasks: t('common.tasks_plural'),
            changeColor: t('ws-task-boards.layout_settings.change_color'),
            backlog: t('ws-task-boards.layout_settings.backlog'),
            active: t('ws-task-boards.layout_settings.active'),
            review: t('ws-task-boards.layout_settings.review'),
            doneStatus: t('ws-task-boards.layout_settings.done_status'),
            closed: t('ws-task-boards.layout_settings.closed'),
            documents: t('ws-task-boards.layout_settings.documents'),
            gray: t('ws-task-boards.layout_settings.gray'),
            red: t('ws-task-boards.layout_settings.red'),
            blue: t('ws-task-boards.layout_settings.blue'),
            green: t('ws-task-boards.layout_settings.green'),
            yellow: t('ws-task-boards.layout_settings.yellow'),
            orange: t('ws-task-boards.layout_settings.orange'),
            purple: t('ws-task-boards.layout_settings.purple'),
            pink: t('ws-task-boards.layout_settings.pink'),
            indigo: t('ws-task-boards.layout_settings.indigo'),
            cyan: t('ws-task-boards.layout_settings.cyan'),
            movedToStatus: t('ws-task-boards.layout_settings.moved_to_status', {
              status: '{status}',
            }),
            deleteList: t('ws-task-boards.layout_settings.delete_list'),
          }}
        />
      )}
      {/* Board Settings Dialog */}
      <Dialog open={boardSettingsOpen} onOpenChange={setBoardSettingsOpen}>
        <DialogContent className="sm:max-w-106.25">
          <DialogHeader>
            <DialogTitle>
              {t('ws-task-boards.actions.board_settings')}
            </DialogTitle>
            <DialogDescription>
              {t('ws-task-boards.settings.configure_description')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="ticketPrefix" className="font-medium text-sm">
                {t('ws-task-boards.settings.ticket_prefix')}
              </label>
              <Input
                id="ticketPrefix"
                value={ticketPrefix}
                onChange={(e) => setTicketPrefix(e.target.value.toUpperCase())}
                placeholder={t(
                  'ws-task-boards.settings.ticket_prefix_placeholder'
                )}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveTicketPrefix();
                  }
                }}
                maxLength={10}
                autoFocus
              />
              <p className="text-muted-foreground text-xs">
                {t('ws-task-boards.settings.ticket_prefix_description')}
              </p>
            </div>
            <div className="grid gap-2">
              <label htmlFor="defaultList" className="font-medium text-sm">
                {t('ws-task-boards.settings.default_list')}
              </label>
              <Combobox
                mode="single"
                options={defaultListOptions}
                selected={defaultListId ?? '__none__'}
                onChange={(value) =>
                  setDefaultListId(value === '__none__' ? null : String(value))
                }
                placeholder={t('ws-task-boards.settings.default_list')}
                searchPlaceholder={t('common.search_tasks')}
              />
              <p className="text-muted-foreground text-xs">
                {t('ws-task-boards.settings.default_list_description')}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBoardSettingsOpen(false)}
              disabled={isLoading}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveTicketPrefix} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.save_changes')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>{' '}
      {/* End Board Settings Dialog */}
      {/* Archive Dialog */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('ws-task-boards.row_actions.dialog.archive_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const name = board.name ?? '';
                const truncated = name.length > 20;
                const display = truncated ? `${name.slice(0, 20)}…` : name;
                return t(
                  'ws-task-boards.row_actions.dialog.archive_description',
                  { name: display }
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveBoard(board.id)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {t('ws-task-boards.row_actions.dialog.archive_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Unarchive Dialog */}
      <AlertDialog
        open={showUnarchiveDialog}
        onOpenChange={setShowUnarchiveDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('ws-task-boards.row_actions.dialog.unarchive_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const name = board.name ?? '';
                const truncated = name.length > 20;
                const display = truncated ? `${name.slice(0, 20)}…` : name;
                return t(
                  'ws-task-boards.row_actions.dialog.unarchive_description',
                  { name: display }
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => unarchiveBoard(board.id)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {t('ws-task-boards.row_actions.dialog.unarchive_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
