import { TaskActions } from '../task-actions';
import { getTasks } from '@/lib/task-helper';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Task } from '@tuturuuu/types/primitives/TaskBoard';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  AlertTriangle,
  ArrowDownUp,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  Flag,
  Search,
  Users,
  X,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { cn } from '@tuturuuu/utils/format';
import { format, isPast, isToday, isTomorrow } from 'date-fns';
import { useEffect, useMemo, useState } from 'react';

interface Props {
  board: { id: string; tasks: Task[] };
}

type SortField = 'name' | 'priority' | 'start_date' | 'end_date' | 'assignees';
type SortOrder = 'asc' | 'desc';

export function ListView({ board }: Props) {
  const [tasks, setTasks] = useState<Task[]>(board.tasks);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Update local state when props change
  useEffect(() => {
    setTasks(board.tasks);
  }, [board.tasks]);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    // Initial data fetch
    async function loadData() {
      try {
        setIsLoading(true);
        const tasks = await getTasks(supabase, board.id);
        if (mounted) setTasks(tasks);
      } catch (error) {
        console.error('Failed to load tasks:', error);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    // Set up real-time subscriptions
    const tasksSubscription = supabase
      .channel('tasks-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
        },
        async () => {
          const tasks = await getTasks(supabase, board.id);
          if (mounted) setTasks(tasks);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_assignees',
        },
        async () => {
          const tasks = await getTasks(supabase, board.id);
          if (mounted) setTasks(tasks);
        }
      )
      .subscribe();

    loadData();

    return () => {
      mounted = false;
      tasksSubscription.unsubscribe();
    };
  }, [board.id]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter(
        (task) =>
          task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          task.description?.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => {
        const aValue = a[sortField];
        const bValue = b[sortField];

        if (sortField === 'assignees') {
          const aLength = a.assignees?.length || 0;
          const bLength = b.assignees?.length || 0;
          return sortOrder === 'asc' ? aLength - bLength : bLength - aLength;
        }

        if (!aValue && !bValue) return 0;
        if (!aValue) return sortOrder === 'asc' ? 1 : -1;
        if (!bValue) return sortOrder === 'asc' ? -1 : 1;

        if (sortField === 'start_date' || sortField === 'end_date') {
          const aDate = new Date(aValue as string);
          const bDate = new Date(bValue as string);
          return sortOrder === 'asc'
            ? aDate.getTime() - bDate.getTime()
            : bDate.getTime() - aDate.getTime();
        }

        return sortOrder === 'asc'
          ? String(aValue).localeCompare(String(bValue))
          : String(bValue).localeCompare(String(aValue));
      });
  }, [tasks, searchQuery, sortField, sortOrder]);

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  function clearSearch() {
    setSearchQuery('');
  }

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

  function getDateStatus(date: string, isArchived: boolean) {
    if (isArchived) return 'completed';

    const dateObj = new Date(date);

    if (isPast(dateObj) && !isToday(dateObj)) {
      return 'overdue';
    }

    if (isToday(dateObj)) {
      return 'today';
    }

    return 'upcoming';
  }

  function renderTaskStatus(task: Task) {
    if (task.archived) {
      return (
        <div className="flex items-center justify-center">
          <CheckCircle2 className="h-4 w-4 text-dynamic-green/80" />
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center">
        <Circle className="h-4 w-4 cursor-pointer text-muted-foreground transition-colors hover:text-dynamic-blue/80" />
      </div>
    );
  }

  function renderPriority(priority: number) {
    const priorityConfig = {
      1: {
        label: 'High',
        color: 'text-dynamic-red/80',
        bgColor: 'bg-dynamic-red/10',
        borderColor: 'border-dynamic-red/30',
      },
      2: {
        label: 'Medium',
        color: 'text-dynamic-yellow/80',
        bgColor: 'bg-dynamic-yellow/10',
        borderColor: 'border-dynamic-yellow/30',
      },
      3: {
        label: 'Low',
        color: 'text-dynamic-green/80',
        bgColor: 'bg-dynamic-green/10',
        borderColor: 'border-dynamic-green/30',
      },
    };

    const config = priorityConfig[priority as keyof typeof priorityConfig];
    if (!config) return null;

    return (
      <Badge
        variant="outline"
        className={cn(
          'text-xs font-medium',
          config.color,
          config.bgColor,
          config.borderColor
        )}
      >
        <Flag className="mr-1 h-2.5 w-2.5" />
        {config.label}
      </Badge>
    );
  }

  function renderDateCell(date: string | null, isEndDate = false) {
    if (!date) return null;

    const status = getDateStatus(date, false);
    const formattedDate = formatDate(date);

    const statusConfig = {
      overdue: { color: 'text-dynamic-red/80', icon: AlertTriangle },
      today: { color: 'text-dynamic-blue/80', icon: Clock },
      upcoming: { color: 'text-muted-foreground', icon: Calendar },
      completed: { color: 'text-muted-foreground', icon: Calendar },
    };

    const config = statusConfig[status];
    const Icon = config.icon;

    return (
      <div className={cn('flex items-center gap-1.5 text-sm', config.color)}>
        <Icon className="h-3.5 w-3.5" />
        <span className="font-medium">{formattedDate}</span>
        {status === 'overdue' && isEndDate && (
          <Badge variant="destructive" className="px-1.5 py-0.5 text-xs">
            Overdue
          </Badge>
        )}
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
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex h-full flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-9 pl-9"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSearch}
              className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2 p-0 hover:bg-muted"
            >
              <X className="h-3 w-3" />
              <span className="sr-only">Clear search</span>
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="rounded-full bg-muted p-6">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">
              {searchQuery ? 'No tasks found' : 'No tasks yet'}
            </h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              {searchQuery
                ? `No tasks match "${searchQuery}". Try adjusting your search terms.`
                : 'Get started by creating your first task.'}
            </p>
          </div>
          {searchQuery && (
            <Button variant="outline" onClick={clearSearch}>
              Clear search
            </Button>
          )}
        </div>
      ) : (
        <div className="relative flex-1 overflow-auto rounded-lg border bg-card">
          <Table>
            <TableHeader className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <TableRow className="border-b">
                <TableHead className="w-[50px] text-center">
                  <span className="text-xs font-medium text-muted-foreground">
                    Status
                  </span>
                </TableHead>
                <TableHead className="min-w-[200px]">
                  <Button
                    variant="ghost"
                    className={cn(
                      '-ml-4 h-8 justify-start hover:bg-transparent',
                      sortField === 'name' && 'text-foreground'
                    )}
                    onClick={() => handleSort('name')}
                  >
                    <span className="font-medium">Task</span>
                    <ArrowDownUp
                      className={cn('ml-2 h-3 w-3 transition-colors', {
                        'text-foreground': sortField === 'name',
                        'text-muted-foreground': sortField !== 'name',
                      })}
                    />
                  </Button>
                </TableHead>
                <TableHead className="w-[120px]">
                  <Button
                    variant="ghost"
                    className={cn(
                      '-ml-4 h-8 justify-start hover:bg-transparent',
                      sortField === 'priority' && 'text-foreground'
                    )}
                    onClick={() => handleSort('priority')}
                  >
                    <span className="font-medium">Priority</span>
                    <ArrowDownUp
                      className={cn('ml-2 h-3 w-3 transition-colors', {
                        'text-foreground': sortField === 'priority',
                        'text-muted-foreground': sortField !== 'priority',
                      })}
                    />
                  </Button>
                </TableHead>
                <TableHead className="w-[140px]">
                  <Button
                    variant="ghost"
                    className={cn(
                      '-ml-4 h-8 justify-start hover:bg-transparent',
                      sortField === 'start_date' && 'text-foreground'
                    )}
                    onClick={() => handleSort('start_date')}
                  >
                    <span className="font-medium">Start Date</span>
                    <ArrowDownUp
                      className={cn('ml-2 h-3 w-3 transition-colors', {
                        'text-foreground': sortField === 'start_date',
                        'text-muted-foreground': sortField !== 'start_date',
                      })}
                    />
                  </Button>
                </TableHead>
                <TableHead className="w-[140px]">
                  <Button
                    variant="ghost"
                    className={cn(
                      '-ml-4 h-8 justify-start hover:bg-transparent',
                      sortField === 'end_date' && 'text-foreground'
                    )}
                    onClick={() => handleSort('end_date')}
                  >
                    <span className="font-medium">Due Date</span>
                    <ArrowDownUp
                      className={cn('ml-2 h-3 w-3 transition-colors', {
                        'text-foreground': sortField === 'end_date',
                        'text-muted-foreground': sortField !== 'end_date',
                      })}
                    />
                  </Button>
                </TableHead>
                <TableHead className="w-[100px]">
                  <Button
                    variant="ghost"
                    className={cn(
                      '-ml-4 h-8 justify-start hover:bg-transparent',
                      sortField === 'assignees' && 'text-foreground'
                    )}
                    onClick={() => handleSort('assignees')}
                  >
                    <span className="font-medium">Team</span>
                    <ArrowDownUp
                      className={cn('ml-2 h-3 w-3 transition-colors', {
                        'text-foreground': sortField === 'assignees',
                        'text-muted-foreground': sortField !== 'assignees',
                      })}
                    />
                  </Button>
                </TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks.map((task) => (
                <TableRow
                  key={task.id}
                  className={cn(
                    'group transition-colors hover:bg-muted/50',
                    task.archived && 'opacity-75'
                  )}
                >
                  <TableCell className="text-center">
                    {renderTaskStatus(task)}
                  </TableCell>
                  <TableCell className="py-4">
                    <div className="space-y-1">
                      <div
                        className={cn('leading-none font-medium', {
                          'text-muted-foreground line-through': task.archived,
                        })}
                      >
                        {task.name}
                      </div>
                      {task.description && (
                        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {task.priority ? renderPriority(task.priority) : null}
                  </TableCell>
                  <TableCell>
                    {task.start_date ? renderDateCell(task.start_date) : null}
                  </TableCell>
                  <TableCell>
                    {task.end_date ? renderDateCell(task.end_date, true) : null}
                  </TableCell>
                  <TableCell>
                    {task.assignees && task.assignees.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {task.assignees.length}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <ChevronDown className="h-4 w-4" />
                          <span className="sr-only">
                            Open task menu for {task.name}
                          </span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setSelectedTaskId(task.id)}
                        >
                          Edit task
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedTaskId && (
        <TaskActions
          taskId={selectedTaskId}
          boardId={board.id}
          onUpdate={() => {
            setSelectedTaskId(null);
            const supabase = createClient();
            getTasks(supabase, board.id).then(setTasks);
          }}
        />
      )}
    </div>
  );
}
