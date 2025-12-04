import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowDownAZ,
  ArrowLeft,
  ArrowUp,
  ArrowUpAZ,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Columns3Cog,
  Flag,
  Gauge,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  Search,
  Settings,
  Trash2,
  X,
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
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { TaskFilter, type TaskFilters } from '../boards/boardId/task-filter';
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
  board: Pick<WorkspaceTaskBoard, 'id' | 'name' | 'ws_id' | 'ticket_prefix'>;
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
}: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedName, setEditedName] = useState(board.name);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [layoutSettingsOpen, setLayoutSettingsOpen] = useState(false);
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false);
  const [ticketPrefix, setTicketPrefix] = useState(board.ticket_prefix || '');
  const [localSearchQuery, setLocalSearchQuery] = useState(
    filters.searchQuery || ''
  );
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

  async function handleEdit() {
    if (!editedName?.trim() || editedName === board.name) {
      setIsEditDialogOpen(false);
      return;
    }

    try {
      setIsLoading(true);
      const supabase = createClient();
      await supabase
        .from('workspace_boards')
        .update({ name: editedName.trim() })
        .eq('id', board.id);

      setIsEditDialogOpen(false);
      // Invalidate and refetch the board data
      queryClient.invalidateQueries({ queryKey: ['task-board', board.id] });
    } catch (error) {
      console.error('Failed to update board name:', error);
    } finally {
      setIsLoading(false);
    }
  }

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

  const viewConfig = {
    kanban: {
      icon: LayoutGrid,
      label: 'Kanban',
      description: 'Traditional kanban board',
    },
    list: {
      icon: List,
      label: 'List',
      description: 'Simple list view',
    },
    timeline: {
      icon: CalendarDays,
      label: 'Timeline',
      description: 'Visual schedule of tasks',
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
    <div className="-mt-2 border-b p-1.5 md:px-4 md:py-2">
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
          <BoardSwitcher board={board} />
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md flex-1">
          {isSearching ? (
            <Loader2 className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2 h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2 h-4 w-4 text-muted-foreground" />
          )}
          <Input
            type="text"
            placeholder="Search tasks..."
            value={localSearchQuery}
            onChange={(e) => setLocalSearchQuery(e.target.value)}
            className="placeholder:-translate-0.5 h-6 bg-background pr-8 pl-8 text-xs placeholder:text-xs sm:h-8 sm:text-sm"
          />
          {localSearchQuery && !isSearching && (
            <button
              type="button"
              onClick={() => setLocalSearchQuery('')}
              className="-translate-y-1/2 absolute top-1/2 right-2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Clear search"
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
              channelName={`board-presence-${board.id}`}
              currentMetadata={presenceMetadata}
              onFiltersChange={onFiltersChange}
              onListStatusFilterChange={onListStatusFilterChange}
            />
          )}

          {/* List Status Filter Tabs */}
          <div className="flex items-center rounded-md border bg-background/80 p-0.75 backdrop-blur-sm">
            <Button
              variant="ghost"
              size="xs"
              className={cn(
                'h-6 px-1.5 text-[10px] transition-all sm:text-xs',
                listStatusFilter === 'all' &&
                  'bg-primary/10 text-primary shadow-sm'
              )}
              onClick={() => onListStatusFilterChange('all')}
            >
              All
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className={cn(
                'h-6 px-1.5 text-[10px] transition-all sm:text-xs',
                listStatusFilter === 'active' &&
                  'bg-primary/10 text-primary shadow-sm'
              )}
              onClick={() => onListStatusFilterChange('active')}
            >
              Active
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className={cn(
                'h-6 px-1.5 text-[10px] transition-all sm:text-xs',
                listStatusFilter === 'not_started' &&
                  'bg-primary/10 text-primary shadow-sm'
              )}
              onClick={() => onListStatusFilterChange('not_started')}
            >
              Backlog
            </Button>
          </div>

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
                <span className="hidden sm:inline">Sort</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              {/* Name */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <ArrowUpAZ className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">Name</span>
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
                    <span className="flex-1">A → Z</span>
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
                    <span className="flex-1">Z → A</span>
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
                  <span className="flex-1">Priority</span>
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
                    <span className="flex-1">High → Low</span>
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
                    <span className="flex-1">Low → High</span>
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
                  <span className="flex-1">Due Date</span>
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
                    <span className="flex-1">Soonest First</span>
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
                    <span className="flex-1">Latest First</span>
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
                  <span className="flex-1">Created</span>
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
                    <span className="flex-1">Newest First</span>
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
                    <span className="flex-1">Oldest First</span>
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
                  <span className="flex-1">Estimate</span>
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
                    <span className="flex-1">Highest First</span>
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
                    <span className="flex-1">Lowest First</span>
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
                    <span>Clear sorting</span>
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
              <DropdownMenuContent align="end" className="w-[200px]">
                <DropdownMenuItem
                  onClick={() => {
                    setEditedName(board.name);
                    setIsEditDialogOpen(true);
                    setBoardMenuOpen(false);
                  }}
                  className="gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  Rename board
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setLayoutSettingsOpen(true);
                    setBoardMenuOpen(false);
                  }}
                  className="gap-2"
                >
                  <Columns3Cog className="h-4 w-4" />
                  Board Layout
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
                  Board Settings
                </DropdownMenuItem>
                {onRecycleBinOpen && (
                  <DropdownMenuItem
                    onClick={() => {
                      onRecycleBinOpen();
                      setBoardMenuOpen(false);
                    }}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Recycle Bin
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
                      Delete board
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently
                        delete the board &quot;{board.name}&quot; and all of its
                        tasks and lists.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={isLoading}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={isLoading}
                        className="bg-dynamic-red/90 text-white hover:bg-dynamic-red"
                      >
                        {isLoading ? 'Deleting...' : 'Delete Board'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Edit Board Name Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Board Name</DialogTitle>
            <DialogDescription>
              Change the name of your board. This will be visible to all team
              members.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Input
              value={editedName?.trim()}
              onChange={(e) => setEditedName(e.target.value)}
              placeholder="Enter board name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleEdit();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={
                isLoading || !editedName?.trim() || editedName === board.name
              }
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Board Layout Settings */}
      {onUpdate && (
        <BoardLayoutSettings
          open={layoutSettingsOpen}
          onOpenChange={setLayoutSettingsOpen}
          boardId={board.id}
          lists={lists}
          onUpdate={onUpdate}
        />
      )}

      {/* Board Settings Dialog */}
      <Dialog open={boardSettingsOpen} onOpenChange={setBoardSettingsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Board Settings</DialogTitle>
            <DialogDescription>
              Configure board-level settings for task management.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="ticketPrefix" className="font-medium text-sm">
                Ticket Prefix
              </label>
              <Input
                id="ticketPrefix"
                value={ticketPrefix}
                onChange={(e) => setTicketPrefix(e.target.value.toUpperCase())}
                placeholder="e.g., DEV, BUG, TASK"
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
                Custom prefix for task identifiers (e.g., DEV-1, BUG-42). Leave
                empty to use default.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBoardSettingsOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveTicketPrefix} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
