import { useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowDown,
  ArrowDownAZ,
  ArrowLeft,
  ArrowUp,
  ArrowUpAZ,
  Bookmark,
  CalendarDays,
  Check,
  ChevronDown,
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
  Trash2,
  X,
  Zap,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useBoardActions } from '@tuturuuu/ui/hooks/use-board-actions';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TaskFilter, type TaskFilters } from '../boards/boardId/task-filter';
import { CopyBoardDialog } from '../boards/copy-board-dialog';
import { TaskBoardForm } from '../boards/form';
import { SaveAsTemplateDialog } from '../boards/save-as-template-dialog';
import { BoardLayoutSettings } from './board-layout-settings';
import { BoardSwitcher } from './board-switcher';
import { BoardUserPresenceAvatarsComponent } from './board-user-presence-avatars';
import type { ViewType } from './board-views';
import type { BoardFiltersMetadata } from './task-filter.types';

export type ListStatusFilter = 'all' | 'active' | 'not_started';

interface BoardViewConfig {
  currentView: ViewType;
  filters: TaskFilters;
  listStatusFilter: ListStatusFilter;
}

function getBoardConfigKey(boardId: string): string {
  return `board_config_${boardId}`;
}

function loadBoardConfig(boardId: string): BoardViewConfig | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(getBoardConfigKey(boardId));
    if (!stored) return null;

    const parsed = JSON.parse(stored);

    // Validate the structure before using it
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.currentView !== 'string' ||
      typeof parsed.filters !== 'object' ||
      typeof parsed.listStatusFilter !== 'string'
    ) {
      console.warn('Invalid board config structure, ignoring');
      return null;
    }

    // Convert date strings back to Date objects in dueDateRange if present
    if (
      parsed.filters.dueDateRange &&
      typeof parsed.filters.dueDateRange === 'object'
    ) {
      const { from, to } = parsed.filters.dueDateRange;
      const newRange: { from?: Date; to?: Date } = {};

      // Validate and convert 'from' date independently
      if (typeof from === 'string') {
        const fromDate = new Date(from);
        if (!Number.isNaN(fromDate.getTime())) {
          newRange.from = fromDate;
        }
      } else if (from instanceof Date && !Number.isNaN(from.getTime())) {
        newRange.from = from;
      }

      // Validate and convert 'to' date independently
      if (typeof to === 'string') {
        const toDate = new Date(to);
        if (!Number.isNaN(toDate.getTime())) {
          newRange.to = toDate;
        }
      } else if (to instanceof Date && !Number.isNaN(to.getTime())) {
        newRange.to = to;
      }

      // Only keep dueDateRange if at least one valid date exists
      if (newRange.from || newRange.to) {
        parsed.filters.dueDateRange = newRange;
      } else {
        delete parsed.filters.dueDateRange;
      }
    }

    return parsed as BoardViewConfig;
  } catch (error) {
    console.error('Failed to load board config from localStorage:', error);
    return null;
  }
}

function saveBoardConfig(boardId: string, config: BoardViewConfig): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(getBoardConfigKey(boardId), JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save board config to localStorage:', error);
  }
}

interface Props {
  board: Pick<
    WorkspaceTaskBoard,
    'id' | 'name' | 'ws_id' | 'ticket_prefix' | 'archived_at'
  > & {
    icon?: WorkspaceTaskBoard['icon'];
  };
  currentUserId?: string;
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
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
}

export function BoardHeader({
  board,
  currentUserId,
  currentView,
  onViewChange,
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
}: Props) {
  const t = useTranslations();
  const [isLoading, setIsLoading] = useState(false);
  const [editBoardOpen, setEditBoardOpen] = useState(false);
  const [duplicateBoardOpen, setDuplicateBoardOpen] = useState(false);
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [layoutSettingsOpen, setLayoutSettingsOpen] = useState(false);
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showUnarchiveDialog, setShowUnarchiveDialog] = useState(false);
  const [ticketPrefix, setTicketPrefix] = useState(board.ticket_prefix || '');
  const [localSearchQuery, setLocalSearchQuery] = useState(
    filters.searchQuery || ''
  );
  const { archiveBoard, unarchiveBoard } = useBoardActions(board.ws_id);
  const queryClient = useQueryClient();
  const router = useRouter();

  // Track which board we've loaded config for to prevent re-loading
  const loadedBoardRef = useRef<string | null>(null);

  // Stable refs for callbacks and values to avoid effect re-runs
  const onFiltersChangeRef = useRef(onFiltersChange);
  const onListStatusFilterChangeRef = useRef(onListStatusFilterChange);
  const onViewChangeRef = useRef(onViewChange);
  const searchQueryRef = useRef(filters.searchQuery);
  const filtersRef = useRef(filters);

  // Update refs on each render
  useEffect(() => {
    onFiltersChangeRef.current = onFiltersChange;
    onListStatusFilterChangeRef.current = onListStatusFilterChange;
    onViewChangeRef.current = onViewChange;
    searchQueryRef.current = filters.searchQuery;
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

  // Load board configuration from localStorage on mount or board change
  useEffect(() => {
    // Only load if we haven't loaded for this board yet
    if (loadedBoardRef.current === board.id) return;

    const savedConfig = loadBoardConfig(board.id);
    if (savedConfig) {
      // Restore saved config but preserve current search query
      onViewChangeRef.current(savedConfig.currentView);
      onFiltersChangeRef.current({
        ...savedConfig.filters,
        searchQuery: searchQueryRef.current,
      });
      onListStatusFilterChangeRef.current(savedConfig.listStatusFilter);
    }

    // Mark this board as loaded
    loadedBoardRef.current = board.id;
  }, [board.id]);

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
      const supabase = createClient();
      await supabase.from('workspace_boards').delete().eq('id', board.id);
      router.push(`/${board.ws_id}/tasks/boards`);
    } catch (error) {
      console.error('Failed to delete board:', error);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveTicketPrefix() {
    try {
      setIsLoading(true);
      const supabase = createClient();

      // Validate and clean the prefix
      const cleanedPrefix = ticketPrefix.trim().toUpperCase();

      await supabase
        .from('workspace_boards')
        .update({ ticket_prefix: cleanedPrefix || null })
        .eq('id', board.id);

      setBoardSettingsOpen(false);

      // Invalidate relevant caches
      queryClient.invalidateQueries({ queryKey: ['task-board', board.id] });
      queryClient.invalidateQueries({ queryKey: ['board-config', board.id] });

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
    setSortMenuOpen(false);
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
          <BoardSwitcher
            board={board}
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
              tasks: t('common.tasks'),
            }}
          />
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md flex-1">
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
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Online Users */}
          {!isPersonalWorkspace && (
            <BoardUserPresenceAvatarsComponent
              boardId={board.id}
              currentMetadata={presenceMetadata}
              onFiltersChange={onFiltersChange}
              onListStatusFilterChange={onListStatusFilterChange}
            />
          )}

          {/* Smart Focus Button */}
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

          {/* Multi-select Toggle */}
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
              className={cn('h-3.5 w-3.5', isMultiSelectMode && 'text-primary')}
            />
          </Button>

          {/* List Status Filter */}
          <Select
            value={listStatusFilter}
            onValueChange={(value) =>
              onListStatusFilterChange(value as ListStatusFilter)
            }
          >
            <SelectTrigger
              className={cn(
                'h-7 w-auto gap-1 bg-background px-2 text-[10px] sm:h-8 sm:px-2.5 sm:text-xs',
                listStatusFilter !== 'all' && 'border-primary/50 bg-primary/5'
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <LayoutGrid className="h-3.5 w-3.5 text-foreground" />
                  <span>{t('common.all')}</span>
                </div>
              </SelectItem>
              <SelectItem value="active">
                <div className="flex items-center gap-2">
                  <Play className="h-3.5 w-3.5 text-dynamic-green" />
                  <span>{t('common.active')}</span>
                </div>
              </SelectItem>
              <SelectItem value="not_started">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-dynamic-orange" />
                  <span>{t('common.backlog')}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          {/* View Switcher Dropdown */}
          <DropdownMenu open={viewMenuOpen} onOpenChange={setViewMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button size="xs" variant="outline">
                {(() => {
                  const Icon = viewConfig[currentView].icon;
                  return (
                    <>
                      <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      <span className="hidden text-[10px] sm:text-xs md:inline">
                        {viewConfig[currentView].label}
                      </span>
                      <ChevronDown className="h-3 w-3 opacity-50 sm:h-3.5 sm:w-3.5" />
                    </>
                  );
                })()}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {Object.entries(viewConfig).map(([view, config]) => {
                const Icon = config.icon;
                return (
                  <DropdownMenuItem
                    key={view}
                    onClick={() => {
                      onViewChange(view as ViewType);
                      setViewMenuOpen(false);
                    }}
                    className="gap-2"
                  >
                    <Icon className="h-4 w-4" />
                    <div className="flex flex-col">
                      <span className="font-medium">{config.label}</span>
                      <span className="text-muted-foreground text-xs">
                        {config.description}
                      </span>
                    </div>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Task Filter */}
          <TaskFilter
            wsId={board.ws_id}
            currentUserId={currentUserId}
            filters={filters}
            onFiltersChange={onFiltersChange}
          />

          {/* Sort Dropdown */}
          <DropdownMenu open={sortMenuOpen} onOpenChange={setSortMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                size="xs"
                variant="outline"
                className={cn(
                  'text-[10px] sm:text-xs',
                  filters.sortBy && 'border-primary/50 bg-primary/5'
                )}
              >
                {filters.sortBy ? (
                  <ArrowDownAZ className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                ) : (
                  <ArrowUpAZ className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                )}
                <span className="hidden sm:inline">{t('common.sort')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-50">
              {/* Name */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <ArrowUpAZ className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">
                    {t('ws-task-boards.filters.sort.name')}
                  </span>
                  {(filters.sortBy === 'name-asc' ||
                    filters.sortBy === 'name-desc') && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={() =>
                      handleSortChange(
                        filters.sortBy === 'name-asc' ? undefined : 'name-asc'
                      )
                    }
                    className="gap-2"
                  >
                    <ArrowUp className="h-3.5 w-3.5 text-dynamic-blue" />
                    <span className="flex-1">
                      {t('ws-task-boards.filters.sort_order.asc')}
                    </span>
                    {filters.sortBy === 'name-asc' && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      handleSortChange(
                        filters.sortBy === 'name-desc' ? undefined : 'name-desc'
                      )
                    }
                    className="gap-2"
                  >
                    <ArrowDown className="h-3.5 w-3.5 text-dynamic-purple" />
                    <span className="flex-1">
                      {t('ws-task-boards.filters.sort_order.desc')}
                    </span>
                    {filters.sortBy === 'name-desc' && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Priority */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <Flag className="h-4 w-4 text-dynamic-red" />
                  <span className="flex-1">
                    {t('ws-task-boards.filters.sort_options.priority')}
                  </span>
                  {(filters.sortBy === 'priority-high' ||
                    filters.sortBy === 'priority-low') && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={() =>
                      handleSortChange(
                        filters.sortBy === 'priority-high'
                          ? undefined
                          : 'priority-high'
                      )
                    }
                    className="gap-2"
                  >
                    <ArrowUp className="h-3.5 w-3.5 text-dynamic-red" />
                    <span className="flex-1">
                      {t('ws-task-boards.filters.sort_options.high_to_low')}
                    </span>
                    {filters.sortBy === 'priority-high' && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      handleSortChange(
                        filters.sortBy === 'priority-low'
                          ? undefined
                          : 'priority-low'
                      )
                    }
                    className="gap-2"
                  >
                    <ArrowDown className="h-3.5 w-3.5 text-dynamic-gray" />
                    <span className="flex-1">
                      {t('ws-task-boards.filters.sort_options.low_to_high')}
                    </span>
                    {filters.sortBy === 'priority-low' && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Due Date */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <CalendarDays className="h-4 w-4 text-dynamic-orange" />
                  <span className="flex-1">
                    {t('ws-task-boards.filters.sort_options.due_date')}
                  </span>
                  {(filters.sortBy === 'due-date-asc' ||
                    filters.sortBy === 'due-date-desc') && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={() =>
                      handleSortChange(
                        filters.sortBy === 'due-date-asc'
                          ? undefined
                          : 'due-date-asc'
                      )
                    }
                    className="gap-2"
                  >
                    <ArrowUp className="h-3.5 w-3.5 text-dynamic-orange" />
                    <span className="flex-1">
                      {t('ws-task-boards.filters.sort_options.soonest_first')}
                    </span>
                    {filters.sortBy === 'due-date-asc' && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      handleSortChange(
                        filters.sortBy === 'due-date-desc'
                          ? undefined
                          : 'due-date-desc'
                      )
                    }
                    className="gap-2"
                  >
                    <ArrowDown className="h-3.5 w-3.5 text-dynamic-blue" />
                    <span className="flex-1">
                      {t('ws-task-boards.filters.sort_options.latest_first')}
                    </span>
                    {filters.sortBy === 'due-date-desc' && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Created Date */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <Clock className="h-4 w-4 text-dynamic-green" />
                  <span className="flex-1">
                    {t('ws-task-boards.filters.sort.created_at')}
                  </span>
                  {(filters.sortBy === 'created-date-desc' ||
                    filters.sortBy === 'created-date-asc') && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={() =>
                      handleSortChange(
                        filters.sortBy === 'created-date-desc'
                          ? undefined
                          : 'created-date-desc'
                      )
                    }
                    className="gap-2"
                  >
                    <ArrowDown className="h-3.5 w-3.5 text-dynamic-green" />
                    <span className="flex-1">
                      {t('ws-task-boards.filters.sort_options.newest_first')}
                    </span>
                    {filters.sortBy === 'created-date-desc' && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      handleSortChange(
                        filters.sortBy === 'created-date-asc'
                          ? undefined
                          : 'created-date-asc'
                      )
                    }
                    className="gap-2"
                  >
                    <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="flex-1">
                      {t('ws-task-boards.filters.sort_options.oldest_first')}
                    </span>
                    {filters.sortBy === 'created-date-asc' && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Estimation Points */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <Gauge className="h-4 w-4 text-dynamic-purple" />
                  <span className="flex-1">
                    {t('ws-task-boards.filters.sort_options.estimate')}
                  </span>
                  {(filters.sortBy === 'estimation-high' ||
                    filters.sortBy === 'estimation-low') && (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={() =>
                      handleSortChange(
                        filters.sortBy === 'estimation-high'
                          ? undefined
                          : 'estimation-high'
                      )
                    }
                    className="gap-2"
                  >
                    <ArrowUp className="h-3.5 w-3.5 text-dynamic-purple" />
                    <span className="flex-1">
                      {t('ws-task-boards.filters.sort_options.highest_first')}
                    </span>
                    {filters.sortBy === 'estimation-high' && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      handleSortChange(
                        filters.sortBy === 'estimation-low'
                          ? undefined
                          : 'estimation-low'
                      )
                    }
                    className="gap-2"
                  >
                    <ArrowDown className="h-3.5 w-3.5 text-dynamic-cyan" />
                    <span className="flex-1">
                      {t('ws-task-boards.filters.sort_options.lowest_first')}
                    </span>
                    {filters.sortBy === 'estimation-low' && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {filters.sortBy && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleSortChange(undefined)}
                    className="gap-2 text-dynamic-red/80 focus:text-dynamic-red"
                  >
                    <X className="h-4 w-4" />
                    <span>
                      {t('ws-task-boards.filters.sort_options.clear_sorting')}
                    </span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Board Actions Menu */}
          {!hideActions && (
            <DropdownMenu open={boardMenuOpen} onOpenChange={setBoardMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 transition-all hover:bg-muted sm:h-7 sm:w-7"
                >
                  <MoreHorizontal className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
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
            wsId={board.ws_id}
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
                queryKey: ['task-board', board.id],
              });
              queryClient.invalidateQueries({
                queryKey: ['other-boards', board.ws_id, board.id],
              });
            }}
          />
        </DialogContent>
      </Dialog>
      {/* Duplicate Board Dialog */}
      <CopyBoardDialog
        board={{ id: board.id, ws_id: board.ws_id, name: board.name }}
        open={duplicateBoardOpen}
        onOpenChange={setDuplicateBoardOpen}
      />
      {/* Save as Template Dialog */}
      <SaveAsTemplateDialog
        board={{ id: board.id, ws_id: board.ws_id, name: board.name }}
        open={saveAsTemplateOpen}
        onOpenChange={setSaveAsTemplateOpen}
      />
      {/* Board Layout Settings */}
      {onUpdate && (
        <BoardLayoutSettings
          open={layoutSettingsOpen}
          onOpenChange={setLayoutSettingsOpen}
          boardId={board.id}
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
