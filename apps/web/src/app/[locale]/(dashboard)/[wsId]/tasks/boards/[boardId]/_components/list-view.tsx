import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/TaskBoard';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Flag,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings2,
  Users,
  X,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
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
import { cn } from '@tuturuuu/utils/format';
import {
  addDays,
  format,
  isPast,
  isToday,
  isTomorrow,
  isWithinInterval,
} from 'date-fns';
import { useEffect, useMemo, useState } from 'react';
import { getTasks } from '@/lib/task-helper';
import { TaskActions } from '../task-actions';

interface Props {
  board: { id: string; tasks: Task[] };
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

interface TableFilters {
  search: string;
  priorities: Set<number>;
  statuses: Set<string>;
  assignees: Set<string>;
  dateFilter: 'all' | 'overdue' | 'today' | 'this_week' | 'no_date';
}

interface ColumnVisibility {
  status: boolean;
  name: boolean;
  priority: boolean;
  start_date: boolean;
  end_date: boolean;
  assignees: boolean;
  actions: boolean;
}

// Priority labels constant - defined once outside component for performance
const priorityLabels = {
  1: 'High',
  2: 'Medium',
  3: 'Low',
};

export function ListView({ board }: Props) {
  const [tasks, setTasks] = useState<Task[]>(board.tasks);
  const [isLoading, setIsLoading] = useState(false);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Filters
  const [filters, setFilters] = useState<TableFilters>({
    search: '',
    priorities: new Set(),
    statuses: new Set(),
    assignees: new Set(),
    dateFilter: 'all',
  });

  // Column visibility
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibility>({
    status: true,
    name: true,
    priority: true,
    start_date: true,
    end_date: true,
    assignees: true,
    actions: true,
  });

  // Filter panel states
  const [priorityFilterOpen, setPriorityFilterOpen] = useState(false);
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);

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

  // Get unique values for filters
  const filterOptions = useMemo(() => {
    const priorities = new Set<number>();
    const statuses = new Set<string>();
    const assignees = new Set<{ id: string; name: string; email: string }>();

    tasks.forEach((task) => {
      if (task.priority) priorities.add(task.priority);

      // Map archived status
      if (task.archived) {
        statuses.add('completed');
      } else {
        statuses.add('active');
      }

      task.assignees?.forEach((assignee) => {
        assignees.add({
          id: assignee.id,
          name: assignee.display_name || assignee.email || 'Unknown',
          email: assignee.email || '',
        });
      });
    });

    return {
      priorities: Array.from(priorities).sort(),
      statuses: Array.from(statuses),
      assignees: Array.from(assignees),
    };
  }, [tasks]);

  // Apply filters and sorting
  const filteredAndSortedTasks = useMemo(() => {
    const filtered = tasks.filter((task) => {
      // Search filter
      if (filters.search) {
        const query = filters.search.toLowerCase();
        const matches =
          task.name.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query) ||
          task.assignees?.some(
            (assignee) =>
              assignee.display_name?.toLowerCase().includes(query) ||
              assignee.email?.toLowerCase().includes(query)
          );
        if (!matches) return false;
      }

      // Priority filter
      if (filters.priorities.size > 0) {
        if (!task.priority || !filters.priorities.has(task.priority)) {
          return false;
        }
      }

      // Status filter
      if (filters.statuses.size > 0) {
        const taskStatus = task.archived ? 'completed' : 'active';
        if (!filters.statuses.has(taskStatus)) {
          return false;
        }
      }

      // Assignees filter
      if (filters.assignees.size > 0) {
        const hasMatchingAssignee = task.assignees?.some((assignee) =>
          filters.assignees.has(assignee.id)
        );
        if (!hasMatchingAssignee) return false;
      }

      // Date filter
      if (filters.dateFilter !== 'all') {
        const now = new Date();
        switch (filters.dateFilter) {
          case 'overdue':
            if (
              !task.end_date ||
              new Date(task.end_date) >= now ||
              task.archived
            ) {
              return false;
            }
            break;
          case 'today':
            if (!task.end_date || !isToday(new Date(task.end_date))) {
              return false;
            }
            break;
          case 'this_week': {
            if (!task.end_date) return false;
            const weekEnd = addDays(now, 7);
            if (
              !isWithinInterval(new Date(task.end_date), {
                start: now,
                end: weekEnd,
              })
            ) {
              return false;
            }
            break;
          }
          case 'no_date':
            if (task.end_date) return false;
            break;
        }
      }

      return true;
    });

    // Sort tasks
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'priority': {
          const aPriority = a.priority ?? 999;
          const bPriority = b.priority ?? 999;
          comparison = aPriority - bPriority;
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

    return filtered;
  }, [tasks, filters, sortField, sortOrder]);

  // Paginated tasks
  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredAndSortedTasks.slice(startIndex, endIndex);
  }, [filteredAndSortedTasks, currentPage, pageSize]);

  // Pagination info
  const totalPages = Math.ceil(filteredAndSortedTasks.length / pageSize);
  const hasNextPage = currentPage < totalPages;
  const hasPreviousPage = currentPage > 1;

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

  function clearAllFilters() {
    setFilters({
      search: '',
      priorities: new Set(),
      statuses: new Set(),
      assignees: new Set(),
      dateFilter: 'all',
    });
    setCurrentPage(1);
  }

  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedTasks(new Set(paginatedTasks.map((task) => task.id)));
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

  function refreshData() {
    const supabase = createClient();
    getTasks(supabase, board.id).then(setTasks);
  }

  // Check if filters are active
  const hasActiveFilters =
    filters.search ||
    filters.priorities.size > 0 ||
    filters.statuses.size > 0 ||
    filters.assignees.size > 0 ||
    filters.dateFilter !== 'all';

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

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
    <div className="mt-2 flex h-full flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-4">
        {/* Search and Actions Row */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search tasks by name or description..."
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
              className="pr-9 pl-9"
            />
            {filters.search && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters({ ...filters, search: '' })}
                className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2 p-0 hover:bg-muted"
              >
                <X className="h-3 w-3" />
                <span className="sr-only">Clear search</span>
              </Button>
            )}
          </div>

          {/* Table Actions */}
          <div className="flex items-center gap-2">
            {/* Priority Filter */}
            <Popover
              open={priorityFilterOpen}
              onOpenChange={setPriorityFilterOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-8 border-dashed',
                    filters.priorities.size > 0 && 'border-solid bg-accent'
                  )}
                >
                  <Flag className="mr-2 h-4 w-4" />
                  Priority
                  {filters.priorities.size > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-2 h-5 w-5 p-0 text-xs"
                    >
                      {filters.priorities.size}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search priorities..." />
                  <CommandList>
                    <CommandEmpty>No priorities found.</CommandEmpty>
                    <CommandGroup>
                      {filterOptions.priorities.map((priority) => {
                        const isSelected = filters.priorities.has(priority);
                        return (
                          <CommandItem
                            key={priority}
                            onSelect={() => {
                              const newPriorities = new Set(filters.priorities);
                              if (isSelected) {
                                newPriorities.delete(priority);
                              } else {
                                newPriorities.add(priority);
                              }
                              setFilters({
                                ...filters,
                                priorities: newPriorities,
                              });
                            }}
                          >
                            <div className="flex items-center space-x-2">
                              <Checkbox checked={isSelected} />
                              <Flag className="mr-2 h-4 w-4" />
                              <span>
                                {
                                  priorityLabels[
                                    priority as keyof typeof priorityLabels
                                  ]
                                }
                              </span>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Status Filter */}
            <Popover open={statusFilterOpen} onOpenChange={setStatusFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-8 border-dashed',
                    filters.statuses.size > 0 && 'border-solid bg-accent'
                  )}
                >
                  <Circle className="mr-2 h-4 w-4" />
                  Status
                  {filters.statuses.size > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-2 h-5 w-5 p-0 text-xs"
                    >
                      {filters.statuses.size}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-0" align="start">
                <Command>
                  <CommandList>
                    <CommandGroup>
                      {filterOptions.statuses.map((status) => {
                        const isSelected = filters.statuses.has(status);
                        return (
                          <CommandItem
                            key={status}
                            onSelect={() => {
                              const newStatuses = new Set(filters.statuses);
                              if (isSelected) {
                                newStatuses.delete(status);
                              } else {
                                newStatuses.add(status);
                              }
                              setFilters({ ...filters, statuses: newStatuses });
                            }}
                          >
                            <div className="flex items-center space-x-2">
                              <Checkbox checked={isSelected} />
                              <span className="capitalize">{status}</span>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Date Filter */}
            <Select
              value={filters.dateFilter}
              onValueChange={(value: any) =>
                setFilters({ ...filters, dateFilter: value })
              }
            >
              <SelectTrigger className="h-8 w-[130px]">
                <Calendar className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All dates</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="today">Due today</SelectItem>
                <SelectItem value="this_week">Due this week</SelectItem>
                <SelectItem value="no_date">No due date</SelectItem>
              </SelectContent>
            </Select>

            {/* More Actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>View options</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={columnVisibility.status}
                  onCheckedChange={(checked) =>
                    setColumnVisibility({
                      ...columnVisibility,
                      status: checked,
                    })
                  }
                >
                  Status
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={columnVisibility.priority}
                  onCheckedChange={(checked) =>
                    setColumnVisibility({
                      ...columnVisibility,
                      priority: checked,
                    })
                  }
                >
                  Priority
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={columnVisibility.start_date}
                  onCheckedChange={(checked) =>
                    setColumnVisibility({
                      ...columnVisibility,
                      start_date: checked,
                    })
                  }
                >
                  Start Date
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={columnVisibility.end_date}
                  onCheckedChange={(checked) =>
                    setColumnVisibility({
                      ...columnVisibility,
                      end_date: checked,
                    })
                  }
                >
                  Due Date
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={columnVisibility.assignees}
                  onCheckedChange={(checked) =>
                    setColumnVisibility({
                      ...columnVisibility,
                      assignees: checked,
                    })
                  }
                >
                  Assignees
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={refreshData}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="h-8"
              >
                <X className="mr-2 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Results and Filter Summary */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              {filteredAndSortedTasks.length} of {tasks.length} task
              {tasks.length !== 1 ? 's' : ''}
            </span>
            {hasActiveFilters && (
              <span className="text-xs">
                •{' '}
                {filteredAndSortedTasks.length !== tasks.length
                  ? 'Filtered'
                  : 'All shown'}
              </span>
            )}
          </div>

          {/* Page Size */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {filteredAndSortedTasks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="rounded-full bg-muted p-6">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">
              {filters.search ? 'No tasks found' : 'No tasks yet'}
            </h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              {filters.search
                ? `No tasks match "${filters.search}". Try adjusting your search terms.`
                : 'Get started by creating your first task.'}
            </p>
          </div>
          {filters.search && (
            <Button
              variant="outline"
              onClick={() => setFilters({ ...filters, search: '' })}
            >
              Clear search
            </Button>
          )}
        </div>
      ) : (
        <div className="relative flex-1 overflow-auto rounded-lg border bg-card">
          <Table>
            <TableHeader className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <TableRow className="border-b">
                <TableHead className="w-[40px] text-center">
                  <Checkbox
                    checked={
                      selectedTasks.size === paginatedTasks.length &&
                      paginatedTasks.length > 0
                    }
                    onCheckedChange={(checked) => handleSelectAll(!!checked)}
                    aria-label="Select all tasks"
                  />
                </TableHead>
                {columnVisibility.status && (
                  <TableHead className="w-[50px] text-center">
                    <span className="text-xs font-medium text-muted-foreground">
                      Status
                    </span>
                  </TableHead>
                )}
                {columnVisibility.name && (
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
                      {getSortIcon('name')}
                    </Button>
                  </TableHead>
                )}
                {columnVisibility.priority && (
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
                      {getSortIcon('priority')}
                    </Button>
                  </TableHead>
                )}
                {columnVisibility.start_date && (
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
                      {getSortIcon('start_date')}
                    </Button>
                  </TableHead>
                )}
                {columnVisibility.end_date && (
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
                      {getSortIcon('end_date')}
                    </Button>
                  </TableHead>
                )}
                {columnVisibility.assignees && (
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
                      {getSortIcon('assignees')}
                    </Button>
                  </TableHead>
                )}
                {columnVisibility.actions && <TableHead className="w-[50px]" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedTasks.map((task) => (
                <TableRow
                  key={task.id}
                  className={cn(
                    'group transition-colors hover:bg-muted/50',
                    task.archived && 'opacity-75',
                    selectedTasks.has(task.id) && 'bg-muted/50'
                  )}
                >
                  <TableCell className="text-center">
                    <Checkbox
                      checked={selectedTasks.has(task.id)}
                      onCheckedChange={(checked) =>
                        handleSelectTask(task.id, !!checked)
                      }
                      aria-label={`Select task ${task.name}`}
                    />
                  </TableCell>
                  {columnVisibility.status && (
                    <TableCell className="text-center">
                      {renderTaskStatus(task)}
                    </TableCell>
                  )}
                  {columnVisibility.name && (
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
                  )}
                  {columnVisibility.priority && (
                    <TableCell>
                      {task.priority ? renderPriority(task.priority) : null}
                    </TableCell>
                  )}
                  {columnVisibility.start_date && (
                    <TableCell>
                      {task.start_date ? renderDateCell(task.start_date) : null}
                    </TableCell>
                  )}
                  {columnVisibility.end_date && (
                    <TableCell>
                      {task.end_date
                        ? renderDateCell(task.end_date, true)
                        : null}
                    </TableCell>
                  )}
                  {columnVisibility.assignees && (
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
                  )}
                  {columnVisibility.actions && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <MoreHorizontal className="h-4 w-4" />
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
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {filteredAndSortedTasks.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              Showing {(currentPage - 1) * pageSize + 1}-
              {Math.min(currentPage * pageSize, filteredAndSortedTasks.length)}{' '}
              of {filteredAndSortedTasks.length} results
            </span>
            {selectedTasks.size > 0 && (
              <>
                <Separator orientation="vertical" className="h-4" />
                <span>{selectedTasks.size} selected</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <span>
                Page {currentPage} of {totalPages}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={!hasPreviousPage}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
                <ChevronLeft className="-ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={!hasPreviousPage}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={!hasNextPage}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={!hasNextPage}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
                <ChevronRight className="-ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Actions for Selected Tasks */}
      {selectedTasks.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 transform items-center gap-3 rounded-lg border bg-background p-3 shadow-lg">
          <span className="text-sm font-medium">
            {selectedTasks.size} task{selectedTasks.size !== 1 ? 's' : ''}{' '}
            selected
          </span>
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedTasks(new Set())}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // TODO: Implement bulk edit
                console.log('Bulk edit:', Array.from(selectedTasks));
              }}
            >
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                // TODO: Implement bulk delete
                console.log('Bulk delete:', Array.from(selectedTasks));
              }}
            >
              Delete
            </Button>
          </div>
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
