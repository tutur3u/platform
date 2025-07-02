import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type {
  Task,
  TaskBoard,
  TaskList,
} from '@tuturuuu/types/primitives/TaskBoard';
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
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  BarChart3,
  Layers,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Trash2,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

interface Props {
  board: TaskBoard & { tasks: Task[]; lists: TaskList[] };
  currentView: 'kanban' | 'status-grouped' | 'list';
  // eslint-disable-next-line no-unused-vars
  onViewChange: (view: 'kanban' | 'status-grouped' | 'list') => void;
}

export function BoardHeader({ board, currentView, onViewChange }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editedName, setEditedName] = useState(board.name);
  const queryClient = useQueryClient();
  const router = useRouter();

  // Calculate board statistics
  const stats = useMemo(() => {
    const totalTasks = board.tasks.length;
    const totalLists = board.lists.length;
    const completedTasks = board.tasks.filter((task) => {
      const taskList = board.lists.find((list) => list.id === task.list_id);
      return (
        task.archived ||
        taskList?.status === 'done' ||
        taskList?.status === 'closed'
      );
    }).length;
    const activeTasks = board.tasks.filter((task) => {
      const taskList = board.lists.find((list) => list.id === task.list_id);
      return !task.archived && taskList?.status === 'active';
    }).length;
    const completionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      totalTasks,
      totalLists,
      completedTasks,
      activeTasks,
      completionRate,
    };
  }, [board.tasks, board.lists]);

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
  };

  return (
    <div className="mb-4 border-b pb-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Board Info */}
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-2xl text-foreground">
                {board.name}
              </h1>
              <Dialog
                open={isEditDialogOpen}
                onOpenChange={setIsEditDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-60 hover:opacity-100"
                    disabled={isLoading}
                    onClick={() => setEditedName(board.name)}
                  >
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit board name</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Edit Board Name</DialogTitle>
                    <DialogDescription>
                      Change the name of your board. This will be visible to all
                      team members.
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
                        isLoading ||
                        !editedName.trim() ||
                        editedName === board.name
                      }
                    >
                      {isLoading ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-muted-foreground text-sm">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4" />
                <span>{stats.totalLists} lists</span>
              </div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <span>{stats.totalTasks} tasks</span>
              </div>
              {stats.totalTasks > 0 && (
                <>
                  <Separator orientation="vertical" className="h-4" />
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-dynamic-green/60" />
                    <span>{stats.completedTasks} completed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-dynamic-blue/60" />
                    <span>{stats.activeTasks} active</span>
                  </div>
                  <Badge
                    variant={
                      stats.completionRate >= 80
                        ? 'default'
                        : stats.completionRate >= 50
                          ? 'secondary'
                          : 'outline'
                    }
                    className="text-xs"
                  >
                    {stats.completionRate}% complete
                  </Badge>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {/* View Switcher */}
          <div className="flex items-center gap-1 rounded-lg border bg-background/80 p-1 backdrop-blur-sm">
            {Object.entries(viewConfig).map(([view, config]) => {
              const Icon = config.icon;
              const isActive = currentView === view;
              return (
                <Button
                  key={view}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'gap-2 transition-all duration-200',
                    isActive && 'bg-primary/10 text-primary shadow-sm'
                  )}
                  onClick={() => onViewChange(view as any)}
                  title={config.description}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{config.label}</span>
                </Button>
              );
            })}
          </div>

          {/* Actions Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 transition-all duration-200 hover:bg-muted"
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Open board menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
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
                      This action cannot be undone. This will permanently delete
                      the board "{board.name}" and all of its tasks and lists.
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
        </div>
      </div>
    </div>
  );
}
