import { useQueryClient } from '@tanstack/react-query';
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
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  Layers,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Trash2,
} from '@tuturuuu/ui/icons';
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

        {/* Controls - Compact Row */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Online Users */}
          {!isPersonalWorkspace && (
            <UserPresenceAvatarsComponent
              channelName={`board_presence_${board.id}`}
            />
          )}

          {/* List Status Filter Tabs */}
          <div className="flex items-center gap-0.5 rounded-md border bg-background/80 p-0.5 backdrop-blur-sm">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 px-1.5 text-[10px] transition-all sm:h-7 sm:px-2 sm:text-xs',
                listStatusFilter === 'all' &&
                  'bg-primary/10 text-primary shadow-sm'
              )}
              onClick={() => onListStatusFilterChange('all')}
            >
              All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 px-1.5 text-[10px] transition-all sm:h-7 sm:px-2 sm:text-xs',
                listStatusFilter === 'active' &&
                  'bg-primary/10 text-primary shadow-sm'
              )}
              onClick={() => onListStatusFilterChange('active')}
            >
              Active
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-6 px-1.5 text-[10px] transition-all sm:h-7 sm:px-2 sm:text-xs',
                listStatusFilter === 'not_started' &&
                  'bg-primary/10 text-primary shadow-sm'
              )}
              onClick={() => onListStatusFilterChange('not_started')}
            >
              Backlog
            </Button>
          </div>

          {/* View Switcher Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-6 gap-1 px-1.5 transition-all sm:h-7 sm:gap-1.5 sm:px-2"
              >
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
