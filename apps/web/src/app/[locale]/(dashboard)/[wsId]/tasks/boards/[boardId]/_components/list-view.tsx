import { TaskActions } from '../task-actions';
import { getTasks } from '@/lib/task-helper';
import { Task } from '@/types/primitives/TaskBoard';
import { createClient } from '@repo/supabase/next/client';
import { Button } from '@repo/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/ui/dropdown-menu';
import { Input } from '@repo/ui/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui/components/ui/table';
import { cn } from '@repo/ui/lib/utils';
import { format } from 'date-fns';
import {
  ArrowDownUp,
  Calendar,
  Check,
  ChevronDown,
  Flag,
  Search,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface Props {
  boardId: string;
  tasks: Task[];
  isLoading: boolean;
}

type SortField = 'name' | 'priority' | 'start_date' | 'end_date' | 'assignees';
type SortOrder = 'asc' | 'desc';

export function ListView({
  boardId,
  tasks: initialTasks,
  isLoading: initialLoading,
}: Props) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [, setIsLoading] = useState(initialLoading);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Update local state when props change
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  useEffect(() => {
    setIsLoading(initialLoading);
  }, [initialLoading]);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();

    // Initial data fetch
    async function loadData() {
      try {
        setIsLoading(true);
        const tasks = await getTasks(supabase, boardId);
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
          const tasks = await getTasks(supabase, boardId);
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
          const tasks = await getTasks(supabase, boardId);
          if (mounted) setTasks(tasks);
        }
      )
      .subscribe();

    loadData();

    return () => {
      mounted = false;
      tasksSubscription.unsubscribe();
    };
  }, [boardId]);

  const filteredTasks = tasks
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

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="relative flex-1 overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead className="w-[40px]">Status</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  className="-ml-4 h-8 hover:bg-transparent"
                  onClick={() => handleSort('name')}
                >
                  <span>Task</span>
                  <ArrowDownUp
                    className={cn('ml-2 h-3 w-3', {
                      'text-foreground': sortField === 'name',
                      'text-muted-foreground': sortField !== 'name',
                    })}
                  />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  className="-ml-4 h-8 hover:bg-transparent"
                  onClick={() => handleSort('priority')}
                >
                  <span>Priority</span>
                  <ArrowDownUp
                    className={cn('ml-2 h-3 w-3', {
                      'text-foreground': sortField === 'priority',
                      'text-muted-foreground': sortField !== 'priority',
                    })}
                  />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  className="-ml-4 h-8 hover:bg-transparent"
                  onClick={() => handleSort('start_date')}
                >
                  <span>Start Date</span>
                  <ArrowDownUp
                    className={cn('ml-2 h-3 w-3', {
                      'text-foreground': sortField === 'start_date',
                      'text-muted-foreground': sortField !== 'start_date',
                    })}
                  />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  className="-ml-4 h-8 hover:bg-transparent"
                  onClick={() => handleSort('end_date')}
                >
                  <span>Due Date</span>
                  <ArrowDownUp
                    className={cn('ml-2 h-3 w-3', {
                      'text-foreground': sortField === 'end_date',
                      'text-muted-foreground': sortField !== 'end_date',
                    })}
                  />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  className="-ml-4 h-8 hover:bg-transparent"
                  onClick={() => handleSort('assignees')}
                >
                  <span>Assignees</span>
                  <ArrowDownUp
                    className={cn('ml-2 h-3 w-3', {
                      'text-foreground': sortField === 'assignees',
                      'text-muted-foreground': sortField !== 'assignees',
                    })}
                  />
                </Button>
              </TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell>
                  <div className="flex justify-center">
                    {task.archived && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span
                      className={cn('font-medium', {
                        'text-muted-foreground line-through': task.archived,
                      })}
                    >
                      {task.name}
                    </span>
                    {task.description && (
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {task.description}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {task.priority && (
                    <div className="flex items-center gap-1">
                      <Flag
                        className={cn('h-3 w-3', {
                          'fill-destructive stroke-destructive':
                            task.priority === 1,
                          'fill-yellow-500 stroke-yellow-500':
                            task.priority === 2,
                          'fill-green-500 stroke-green-500':
                            task.priority === 3,
                        })}
                      />
                      <span>P{task.priority}</span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {task.start_date && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(task.start_date), 'PP')}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {task.end_date && (
                    <div
                      className={cn('flex items-center gap-1', {
                        'text-muted-foreground':
                          !task.archived &&
                          new Date(task.end_date) > new Date(),
                        'font-medium text-destructive':
                          !task.archived &&
                          new Date(task.end_date) < new Date(),
                      })}
                    >
                      <Calendar className="h-3 w-3" />
                      {format(new Date(task.end_date), 'PP')}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {task.assignees && task.assignees.length > 0 && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {task.assignees.length}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ChevronDown className="h-4 w-4" />
                        <span className="sr-only">Open task menu</span>
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

      {selectedTaskId && (
        <TaskActions
          taskId={selectedTaskId}
          taskName={tasks.find((t) => t.id === selectedTaskId)?.name || ''}
          taskDescription={
            tasks.find((t) => t.id === selectedTaskId)?.description || null
          }
          startDate={
            tasks.find((t) => t.id === selectedTaskId)?.start_date || null
          }
          endDate={tasks.find((t) => t.id === selectedTaskId)?.end_date || null}
          priority={
            tasks.find((t) => t.id === selectedTaskId)?.priority || null
          }
          archived={
            tasks.find((t) => t.id === selectedTaskId)?.archived || false
          }
          assignees={
            tasks.find((t) => t.id === selectedTaskId)?.assignees || []
          }
          onUpdate={() => {
            setSelectedTaskId(null);
            const supabase = createClient();
            getTasks(supabase, boardId).then(setTasks);
          }}
          open={true}
          onOpenChange={(open) => !open && setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}
