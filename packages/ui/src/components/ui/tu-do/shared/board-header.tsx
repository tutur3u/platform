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
    Flag,
    Gauge,
    Layers,
    LayoutGrid,
    List,
    Loader2,
    MoreHorizontal,
    Pencil,
    Search,
    Trash2,
    X,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
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
import { useState } from 'react';
import { TaskFilter, type TaskFilters } from '../boards/boardId/task-filter';
import type { ViewType } from './board-views';
import { UserPresenceAvatarsComponent } from './user-presence-avatars';

export type ListStatusFilter = 'all' | 'active' | 'not_started';

interface Props {
  board: TaskBoard;
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
}: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedName, setEditedName] = useState(board.name);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  async function handleEdit() {
    if (!editedName.trim() || editedName === board.name) {
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

  const viewConfig = {
    'status-grouped': {
      icon: Layers,
      label: 'Status',
      description: 'Group by workflow status',
    },
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
          <h1 className="truncate font-bold text-base text-foreground sm:text-xl md:text-2xl">
            {board.name}
          </h1>
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
            value={filters.searchQuery || ''}
            onChange={(e) => {
              const newSearchQuery = e.target.value;
              onFiltersChange({ ...filters, searchQuery: newSearchQuery });

              // Auto-switch to List view when searching in Status or Timeline view
              if (
                newSearchQuery &&
                (currentView === 'status-grouped' || currentView === 'timeline')
              ) {
                onViewChange('list');
              }
            }}
            className="placeholder:-translate-0.5 h-6 bg-background pr-8 pl-8 text-xs placeholder:text-xs sm:h-8 sm:text-sm"
          />
          {filters.searchQuery && !isSearching && (
            <button
              type="button"
              onClick={() =>
                onFiltersChange({ ...filters, searchQuery: undefined })
              }
              className="-translate-y-1/2 absolute top-1/2 right-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Controls - Compact Row */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Online Users */}
          {!isPersonalWorkspace && (
            <UserPresenceAvatarsComponent
              channelName={`board_presence_${board.id}`}
            />
          )}

          {/* List Status Filter Tabs */}
          <div className="flex items-center gap-[0.1875rem] rounded-md border bg-background/80 p-[0.1875rem] backdrop-blur-sm">
            <Button
              variant="ghost"
              size="xs"
              className={cn(
                'h-6 px-1.5 text-[10px] transition-all sm:text-xs',
                listStatusFilter === 'all' &&
                  'bg-primary/10 text-primary shadow-sm',
                currentView === 'status-grouped' && 'opacity-50'
              )}
              onClick={() => onListStatusFilterChange('all')}
              disabled={currentView === 'status-grouped'}
            >
              All
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className={cn(
                'h-6 px-1.5 text-[10px] transition-all sm:text-xs',
                listStatusFilter === 'active' &&
                  'bg-primary/10 text-primary shadow-sm',
                currentView === 'status-grouped' && 'opacity-50'
              )}
              onClick={() => onListStatusFilterChange('active')}
              disabled={currentView === 'status-grouped'}
            >
              Active
            </Button>
            <Button
              variant="ghost"
              size="xs"
              className={cn(
                'h-6 px-1.5 text-[10px] transition-all sm:text-xs',
                listStatusFilter === 'not_started' &&
                  'bg-primary/10 text-primary shadow-sm',
                currentView === 'status-grouped' && 'opacity-50'
              )}
              onClick={() => onListStatusFilterChange('not_started')}
              disabled={currentView === 'status-grouped'}
            >
              Backlog
            </Button>
          </div>

          {/* View Switcher Dropdown */}
          <DropdownMenu>
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
                    onClick={() => onViewChange(view as ViewType)}
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
          <DropdownMenu>
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
                      onFiltersChange({
                        ...filters,
                        sortBy:
                          filters.sortBy === 'name-asc'
                            ? undefined
                            : 'name-asc',
                      })
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
                      onFiltersChange({
                        ...filters,
                        sortBy:
                          filters.sortBy === 'name-desc'
                            ? undefined
                            : 'name-desc',
                      })
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
                      onFiltersChange({
                        ...filters,
                        sortBy:
                          filters.sortBy === 'priority-high'
                            ? undefined
                            : 'priority-high',
                      })
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
                      onFiltersChange({
                        ...filters,
                        sortBy:
                          filters.sortBy === 'priority-low'
                            ? undefined
                            : 'priority-low',
                      })
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
                      onFiltersChange({
                        ...filters,
                        sortBy:
                          filters.sortBy === 'due-date-asc'
                            ? undefined
                            : 'due-date-asc',
                      })
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
                      onFiltersChange({
                        ...filters,
                        sortBy:
                          filters.sortBy === 'due-date-desc'
                            ? undefined
                            : 'due-date-desc',
                      })
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
                      onFiltersChange({
                        ...filters,
                        sortBy:
                          filters.sortBy === 'created-date-desc'
                            ? undefined
                            : 'created-date-desc',
                      })
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
                      onFiltersChange({
                        ...filters,
                        sortBy:
                          filters.sortBy === 'created-date-asc'
                            ? undefined
                            : 'created-date-asc',
                      })
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
                      onFiltersChange({
                        ...filters,
                        sortBy:
                          filters.sortBy === 'estimation-high'
                            ? undefined
                            : 'estimation-high',
                      })
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
                      onFiltersChange({
                        ...filters,
                        sortBy:
                          filters.sortBy === 'estimation-low'
                            ? undefined
                            : 'estimation-low',
                      })
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
                    onClick={() =>
                      onFiltersChange({ ...filters, sortBy: undefined })
                    }
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
              value={editedName}
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
                isLoading || !editedName.trim() || editedName === board.name
              }
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
