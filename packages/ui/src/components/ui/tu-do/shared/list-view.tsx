'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
    ArrowDown,
    ArrowDownUp,
    ArrowUp,
    CheckCircle2,
    horseHead,
    Icon,
    MoreHorizontal,
    Rabbit,
    Turtle,
    unicornHead,
    X,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
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
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@tuturuuu/ui/table';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { getTasks, priorityCompare } from '@tuturuuu/utils/task-helper';
import { format, isPast, isToday, isTomorrow } from 'date-fns';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { TaskEditDialog } from './task-edit-dialog';

interface Props {
  boardId: string;
  tasks: Task[];
  lists: TaskList[];
  isPersonalWorkspace?: boolean;
  searchQuery?: string;
}

type SortField =
  | 'name'
  | 'priority'
  | 'start_date'
  | 'end_date'
  | 'assignees'
  | 'created_at'
  | 'status';
type SortOrder = 'asc' | 'desc';

interface ColumnVisibility {
  status: boolean;
  name: boolean;
  priority: boolean;
  start_date: boolean;
  end_date: boolean;
  assignees: boolean;
  actions: boolean;
}

const SKELETON_KEYS: string[] = ['a', 'b', 'c', 'd', 'e'];

export function ListView({
  boardId,
  tasks,
  lists,
  isPersonalWorkspace = false,
  searchQuery,
}: Props) {
  const queryClient = useQueryClient();
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const [isLoading, setIsLoading] = useState(false);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());

  // Infinite scroll
  const [displayCount, setDisplayCount] = useState(50);
  const LOAD_MORE_COUNT = 50;

  // Column visibility
  const [columnVisibility] = useState<ColumnVisibility>({
    status: true,
    name: true,
    priority: true,
    start_date: false,
    end_date: true,
    assignees: !isPersonalWorkspace,
    actions: true,
  });

  // Bulk actions state
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  // Bulk delete function
  const handleBulkDelete = async () => {
    if (selectedTasks.size === 0) return;
    setShowBulkDeleteDialog(true);
  };

  const handleBulkDeleteConfirmed = async () => {
    setShowBulkDeleteDialog(false);
    setIsLoading(true);
    try {
      const supabase = createClient();
      const taskIds = Array.from(selectedTasks);
      await supabase.from('tasks').delete().in('id', taskIds);
      // Refresh the task list and invalidate cache
      const updatedTasks = await getTasks(supabase, boardId);
      setLocalTasks(updatedTasks);
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      setSelectedTasks(new Set());
      toast({
        title: 'Tasks deleted',
        description: `${taskIds.length} task${taskIds.length !== 1 ? 's' : ''} deleted successfully.`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error deleting tasks:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete tasks.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Update local state when props change
  useEffect(() => {
    setLocalTasks(tasks);
    setDisplayCount(50); // Reset display count when tasks change
  }, [tasks]);

  // Apply sorting only (filters are handled by parent)
  const sortedTasks = useMemo(() => {
    const sorted = [...localTasks];

    // If there's an active search query, preserve the search ranking from parent
    // and skip local sorting
    if (searchQuery && searchQuery.trim().length > 0) {
      return sorted;
    }

    // Sort tasks
    sorted.sort((a, b) => {
      // Primary sort: Always prioritize uncompleted tasks (non-archived) first
      const aCompleted = a.archived || false;
      const bCompleted = b.archived || false;

      if (aCompleted !== bCompleted) {
        // Uncompleted (false) should come before completed (true)
        return aCompleted ? 1 : -1;
      }

      // Secondary sort: Apply the selected sort field
      let comparison = 0;

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'priority': {
          const aPriority = a.priority ?? null;
          const bPriority = b.priority ?? null;
          comparison = priorityCompare(aPriority, bPriority);
          break;
        }
        case 'start_date': {
          const aDate = a.start_date
            ? new Date(a.start_date).getTime()
            : Number.MAX_SAFE_INTEGER;
          const bDate = b.start_date
            ? new Date(b.start_date).getTime()
            : Number.MAX_SAFE_INTEGER;
          comparison = aDate - bDate;
          break;
        }
        case 'end_date': {
          const aDate = a.end_date
            ? new Date(a.end_date).getTime()
            : Number.MAX_SAFE_INTEGER;
          const bDate = b.end_date
            ? new Date(b.end_date).getTime()
            : Number.MAX_SAFE_INTEGER;
          comparison = aDate - bDate;
          break;
        }
        case 'created_at': {
          const aCreated = new Date(a.created_at).getTime();
          const bCreated = new Date(b.created_at).getTime();
          comparison = aCreated - bCreated;
          break;
        }
        case 'assignees': {
          const aLength = a.assignees?.length || 0;
          const bLength = b.assignees?.length || 0;
          comparison = aLength - bLength;
          break;
        }
        case 'status': {
          const aStatus = a.archived ? 'completed' : 'active';
          const bStatus = b.archived ? 'completed' : 'active';
          comparison = aStatus.localeCompare(bStatus);
          break;
        }
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return sorted;
  }, [localTasks, sortField, sortOrder, searchQuery]);

  // Display tasks with infinite scroll
  const displayedTasks = useMemo(() => {
    return sortedTasks.slice(0, displayCount);
  }, [sortedTasks, displayCount]);

  const hasMore = displayCount < sortedTasks.length;

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  function getSortIcon(field: SortField) {
    if (sortField !== field) {
      return <ArrowDownUp className="ml-2 h-3 w-3 text-muted-foreground" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-2 h-3 w-3 text-foreground" />
    ) : (
      <ArrowDown className="ml-2 h-3 w-3 text-foreground" />
    );
  }

  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedTasks(new Set(displayedTasks.map((task) => task.id)));
    } else {
      setSelectedTasks(new Set());
    }
  }

  function handleSelectTask(taskId: string, checked: boolean) {
    const newSelected = new Set(selectedTasks);
    if (checked) {
      newSelected.add(taskId);
    } else {
      newSelected.delete(taskId);
    }
    setSelectedTasks(newSelected);
  }

  // Infinite scroll handler
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLDivElement;
      if (!target) return;

      const { scrollTop, scrollHeight, clientHeight } = target;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

      // Load more when user scrolls to 80%
      if (scrollPercentage > 0.8 && hasMore && !isLoading) {
        setDisplayCount((prev) => prev + LOAD_MORE_COUNT);
      }
    };

    const scrollContainer = document.querySelector('[data-scroll-container]');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  }, [hasMore, isLoading]);

  function formatDate(date: string) {
    const dateObj = new Date(date);

    if (isToday(dateObj)) {
      return 'Today';
    }

    if (isTomorrow(dateObj)) {
      return 'Tomorrow';
    }

    return format(dateObj, 'MMM dd');
  }

  function renderTaskStatus(task: Task) {
    if (task.archived) {
      return (
        <div className="flex items-center justify-center">
          <CheckCircle2 className="h-4 w-4 text-dynamic-green/80" />
        </div>
      );
    }

    // Check if task is in a "done" list but not individually archived
    const isInDoneList =
      task.list_id &&
      lists?.some((list) => list.id === task.list_id && list.status === 'done');

    return (
      <div className="flex items-center justify-center">
        <div
          className={cn(
            'h-4 w-4 rounded-full border-2',
            isInDoneList
              ? 'animate-pulse border-amber-500/30 bg-amber-500/60 [animation-duration:4s]'
              : 'border-muted-foreground/30'
          )}
          title={
            isInDoneList
              ? 'Task is in Done list but not individually checked'
              : undefined
          }
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mt-2 flex h-full flex-col gap-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 flex-1" />
        </div>
        <div className="space-y-3">
          {SKELETON_KEYS.map((key: string) => (
            <Skeleton key={`loading-skeleton-${key}`} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Find the selected task for editing
  const selectedTask = selectedTaskId
    ? tasks.find((task) => task.id === selectedTaskId)
    : null;

  return (
    <div className="flex h-full flex-col">
      {sortedTasks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground text-sm">No tasks</p>
          </div>
        </div>
      ) : (
        <div className="relative flex-1 overflow-auto" data-scroll-container>
          <TooltipProvider>
            <Table>
              <TableHeader className="sticky top-0 z-10 border-b">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="flex h-7 items-center justify-center px-0">
                    <Checkbox
                      checked={
                        selectedTasks.size === displayedTasks.length &&
                        displayedTasks.length > 0
                      }
                      onCheckedChange={(checked) => handleSelectAll(!!checked)}
                      aria-label="Select all tasks"
                      className="h-3.5 w-3.5 transition-all"
                    />
                  </TableHead>
                  {columnVisibility.status && (
                    <TableHead className="h-9 w-[40px] px-2 text-center">
                      <span className="flex items-center justify-center font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
                        Status
                      </span>
                    </TableHead>
                  )}
                  {columnVisibility.name && (
                    <TableHead className="h-9 min-w-[250px] px-2">
                      <Button
                        variant="ghost"
                        className={cn(
                          '-ml-2 h-6 justify-start gap-1 px-2 font-medium text-[10px] uppercase tracking-wider transition-colors hover:bg-muted/50',
                          sortField === 'name'
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        )}
                        onClick={() => handleSort('name')}
                      >
                        Task
                        {getSortIcon('name')}
                      </Button>
                    </TableHead>
                  )}
                  {columnVisibility.priority && (
                    <TableHead className="h-9 w-[90px] px-2">
                      <Button
                        variant="ghost"
                        className={cn(
                          '-ml-2 h-6 justify-start gap-1 px-2 font-medium text-[10px] uppercase tracking-wider transition-colors hover:bg-muted/50',
                          sortField === 'priority'
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        )}
                        onClick={() => handleSort('priority')}
                      >
                        Priority
                        {getSortIcon('priority')}
                      </Button>
                    </TableHead>
                  )}
                  {columnVisibility.end_date && (
                    <TableHead className="h-9 w-[100px] px-2">
                      <Button
                        variant="ghost"
                        className={cn(
                          '-ml-2 h-6 justify-start gap-1 px-2 font-medium text-[10px] uppercase tracking-wider transition-colors hover:bg-muted/50',
                          sortField === 'end_date'
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        )}
                        onClick={() => handleSort('end_date')}
                      >
                        Due
                        {getSortIcon('end_date')}
                      </Button>
                    </TableHead>
                  )}
                  {columnVisibility.assignees && (
                    <TableHead className="h-9 w-[80px] px-2">
                      <Button
                        variant="ghost"
                        className={cn(
                          '-ml-2 h-6 justify-start gap-1 px-2 font-medium text-[10px] uppercase tracking-wider transition-colors hover:bg-muted/50',
                          sortField === 'assignees'
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        )}
                        onClick={() => handleSort('assignees')}
                      >
                        Assignee
                        {getSortIcon('assignees')}
                      </Button>
                    </TableHead>
                  )}
                  {columnVisibility.actions && (
                    <TableHead className="h-9 w-[30px] px-2" />
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedTasks.map((task) => (
                  <TableRow
                    key={task.id}
                    className={cn(
                      'group h-11 cursor-pointer border-b transition-all duration-200',
                      'hover:bg-muted/50 hover:shadow-sm',
                      task.archived && 'opacity-60 saturate-50',
                      selectedTasks.has(task.id) &&
                        'bg-gradient-to-r from-primary/10 via-primary/5 to-transparent shadow-sm ring-1 ring-primary/20',
                      task.end_date &&
                        new Date(task.end_date) < new Date() &&
                        !task.archived &&
                        'border-l-2 border-l-dynamic-red/70 bg-dynamic-red/5'
                    )}
                    onClick={(e) => {
                      if (
                        (e.target as HTMLElement).closest(
                          'input[type="checkbox"], button'
                        )
                      ) {
                        return;
                      }
                      setSelectedTaskId(task.id);
                    }}
                  >
                    <TableCell className="px-2.5 py-0">
                      <Checkbox
                        checked={selectedTasks.has(task.id)}
                        onCheckedChange={(checked) =>
                          handleSelectTask(task.id, !!checked)
                        }
                        aria-label={`Select task ${task.name}`}
                        className="h-3.5 w-3.5"
                      />
                    </TableCell>
                    {columnVisibility.status && (
                      <TableCell className="px-2 py-0 text-center">
                        {renderTaskStatus(task)}
                      </TableCell>
                    )}
                    {columnVisibility.name && (
                      <TableCell className="px-2 py-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'truncate text-sm',
                              task.archived &&
                                'text-muted-foreground line-through'
                            )}
                          >
                            {task.name}
                          </span>
                          {task.labels && task.labels.length > 0 && (
                            <div className="flex items-center gap-1">
                              {task.labels.slice(0, 2).map((label) => (
                                <Badge
                                  key={label.id}
                                  variant="outline"
                                  style={{
                                    backgroundColor: `color-mix(in srgb, ${label.color} 12%, transparent)`,
                                    borderColor: `color-mix(in srgb, ${label.color} 25%, transparent)`,
                                    color: label.color,
                                  }}
                                  className="h-4 px-1.5 text-[10px]"
                                >
                                  {label.name}
                                </Badge>
                              ))}
                              {task.labels.length > 2 && (
                                <span className="text-muted-foreground text-xs">
                                  +{task.labels.length - 2}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {columnVisibility.priority && (
                      <TableCell className="px-2 py-0">
                        {task.priority && (
                          <Badge
                            variant="secondary"
                            className={cn(
                              'h-5 border p-1 font-medium text-[10px] transition-all',
                              task.priority === 'critical' &&
                                'border-dynamic-red/50 bg-dynamic-red/20 text-dynamic-red shadow-dynamic-red/20 shadow-sm',
                              task.priority === 'high' &&
                                'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
                              task.priority === 'normal' &&
                                'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
                              task.priority === 'low' &&
                                'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue'
                            )}
                          >
                            {task.priority === 'critical' && (
                              <Icon
                                iconNode={unicornHead}
                                className="h-3 w-3"
                              />
                            )}
                            {task.priority === 'high' && (
                              <Icon iconNode={horseHead} className="h-3 w-3" />
                            )}
                            {task.priority === 'normal' && (
                              <Rabbit className="h-3 w-3" />
                            )}
                            {task.priority === 'low' && (
                              <Turtle className="h-3 w-3" />
                            )}
                          </Badge>
                        )}
                      </TableCell>
                    )}
                    {columnVisibility.end_date && (
                      <TableCell className="px-2 py-0">
                        {task.end_date && (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                'font-medium text-xs transition-colors',
                                isPast(new Date(task.end_date)) &&
                                  !task.archived
                                  ? 'text-dynamic-red'
                                  : 'text-muted-foreground'
                              )}
                            >
                              {formatDate(task.end_date)}
                            </span>
                            {isPast(new Date(task.end_date)) &&
                              !task.archived && (
                                <Badge className="h-4 bg-dynamic-red px-1 text-[9px] text-white">
                                  Overdue
                                </Badge>
                              )}
                          </div>
                        )}
                      </TableCell>
                    )}
                    {columnVisibility.assignees && (
                      <TableCell className="px-2 py-0">
                        {task.assignees && task.assignees.length > 0 && (
                          <div className="-space-x-1 flex">
                            {task.assignees.slice(0, 2).map((assignee) => (
                              <div
                                key={assignee.id}
                                className="relative inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-background bg-muted"
                                title={
                                  assignee.display_name ||
                                  assignee.email ||
                                  'User'
                                }
                              >
                                {assignee.avatar_url ? (
                                  <Image
                                    src={assignee.avatar_url}
                                    alt={
                                      assignee.display_name ||
                                      assignee.email ||
                                      'User'
                                    }
                                    width={20}
                                    height={20}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="text-[9px]">
                                    {(assignee.display_name ||
                                      assignee.email ||
                                      '?')[0]?.toUpperCase()}
                                  </span>
                                )}
                              </div>
                            ))}
                            {task.assignees.length > 2 && (
                              <span className="ml-1 text-muted-foreground text-xs">
                                +{task.assignees.length - 2}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>
                    )}
                    {columnVisibility.actions && (
                      <TableCell className="px-2 py-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100"
                          onClick={() => setSelectedTaskId(task.id)}
                        >
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TooltipProvider>

          {/* Infinite scroll loading indicator */}
          {hasMore && (
            <div className="flex items-center justify-center border-t bg-gradient-to-b from-background to-muted/20 py-4">
              <div className="flex items-center gap-2.5 rounded-lg border bg-background px-4 py-2 shadow-sm">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="font-medium text-muted-foreground text-xs">
                  Loading more tasks...
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk Actions for Selected Tasks */}
      {selectedTasks.size > 0 && (
        <div className="-translate-x-1/2 slide-in-from-bottom-4 fixed bottom-6 left-1/2 z-50 flex transform animate-in items-center gap-3 rounded-lg border bg-background p-4 shadow-xl backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-sm">
              {selectedTasks.size} task{selectedTasks.size !== 1 ? 's' : ''}{' '}
              selected
            </span>
          </div>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedTasks(new Set())}
              className="h-8"
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              className="h-8"
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Task Edit Dialog */}
      {selectedTask && (
        <TaskEditDialog
          task={selectedTask}
          boardId={boardId}
          isOpen={!!selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={() => {
            setSelectedTaskId(null);
            const supabase = createClient();
            getTasks(supabase, boardId).then(setLocalTasks);
          }}
          showUserPresence={!isPersonalWorkspace}
        />
      )}

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected tasks?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedTasks.size} selected task
              {selectedTasks.size !== 1 ? 's' : ''}? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={handleBulkDeleteConfirmed}
                disabled={isLoading}
              >
                {isLoading ? 'Deleting...' : 'Delete'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
