'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Flag,
  HelpCircle,
  List,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings2,
  Users,
  X,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
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
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { getTasks, priorityCompare } from '@tuturuuu/utils/task-helper';
import {
  addDays,
  format,
  isPast,
  isToday,
  isTomorrow,
  isWithinInterval,
} from 'date-fns';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { getDescriptionText } from '../../../../utils/text-helper';
import { TaskEditDialog } from './task-edit-dialog';

interface Props {
  boardId: string;
  tasks: Task[];
  lists: TaskList[];
  isPersonalWorkspace?: boolean;
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
  priorities: Set<TaskPriority>;
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

interface Member {
  id: string;
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

// Priority labels constant - defined once outside component for performance
const priorityLabels = {
  critical: '🔥 Urgent',
  high: 'High',
  normal: 'Medium',
  low: 'Low',
  null: 'No Priority',
};

const priorityColors = {
  critical:
    'border-dynamic-red bg-dynamic-red text-white shadow-sm shadow-dynamic-red/30 font-semibold',
  high: 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
  normal: 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
  low: 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
  null: 'border-dynamic-gray/30 bg-dynamic-gray/10 text-foreground/70',
};

const SKELETON_KEYS: string[] = ['a', 'b', 'c', 'd', 'e'];

export function ListView({
  boardId,
  tasks,
  lists,
  isPersonalWorkspace = false,
}: Props) {
  const queryClient = useQueryClient();
  const params = useParams();
  const wsId = params.wsId as string;

  // Fetch workspace members
  const { data: members = [] } = useQuery({
    queryKey: ['workspace-members', wsId],
    queryFn: async () => {
      const response = await fetch(`/api/workspaces/${wsId}/members`);
      if (!response.ok) throw new Error('Failed to fetch members');
      const { members: fetchedMembers } = await response.json();
      return fetchedMembers;
    },
    enabled: !!wsId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
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
    assignees: !isPersonalWorkspace,
    actions: true,
  });

  // Bulk actions state
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({
    priority: 'keep',
    status: 'keep',
  });
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  // Bulk edit functions
  const handleBulkEdit = async () => {
    if (selectedTasks.size === 0) return;

    setIsBulkEditing(true);
  };

  const handleBulkEditSave = async () => {
    if (selectedTasks.size === 0) return;

    setIsLoading(true);
    try {
      const supabase = createClient();
      const taskIds = Array.from(selectedTasks);

      // Build update object with only the fields that need to be updated
      const updateData: {
        priority?: TaskPriority | null;
        archived?: boolean;
      } = {};
      let hasUpdates = false;

      if (bulkEditData.priority !== 'keep') {
        updateData.priority =
          bulkEditData.priority !== 'none'
            ? (bulkEditData.priority as TaskPriority)
            : null;
        hasUpdates = true;
      }

      if (bulkEditData.status !== 'keep') {
        updateData.archived = bulkEditData.status === 'completed';
        hasUpdates = true;
      }

      if (hasUpdates) {
        console.log('🔄 Updating tasks:', updateData);
        // Use normal Supabase update query instead of RPC
        const { error } = await supabase
          .from('tasks')
          .update(updateData)
          .in('id', taskIds);
        if (error) throw error;
      }

      // Refresh the task list and invalidate cache
      const updatedTasks = await getTasks(supabase, boardId);
      setLocalTasks(updatedTasks);
      queryClient.invalidateQueries({ queryKey: ['tasks', boardId] });
      setSelectedTasks(new Set());
      setIsBulkEditing(false);
      setBulkEditData({ priority: 'keep', status: 'keep' });
      toast({
        title: 'Tasks updated',
        description: `${taskIds.length} task${taskIds.length !== 1 ? 's' : ''} updated successfully.`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error updating tasks:', error);
      toast({
        title: 'Error',
        description: 'Failed to update tasks.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

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
  }, [tasks]);

  // Get unique values for filters
  const filterOptions = useMemo(() => {
    const priorities = new Set<TaskPriority>();
    const statuses = new Set<string>();
    const assignees = new Set<{ id: string; name: string; email: string }>();

    // Always include all possible priorities (0 = No Priority, 1 = Urgent, 2 = High, 3 = Medium, 4 = Low)
    priorities.add('critical');
    priorities.add('high');
    priorities.add('normal');
    priorities.add('low');

    // Always include all possible statuses
    statuses.add('active');
    statuses.add('completed');

    localTasks.forEach((task) => {
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
  }, [localTasks]);

  // Apply filters and sorting
  const filteredAndSortedTasks = useMemo(() => {
    const filtered = localTasks.filter((task) => {
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
        // Handle special filter options
        if (filters.assignees.has('all')) {
          // "All" option selected - show all tasks
        } else if (filters.assignees.has('unassigned')) {
          // "Unassigned" option selected - show tasks with no assignees
          if (task.assignees && task.assignees.length > 0) {
            return false;
          }
        } else {
          // Specific assignees selected
          const hasMatchingAssignee = task.assignees?.some((assignee) =>
            filters.assignees.has(assignee.id)
          );
          if (!hasMatchingAssignee) return false;
        }
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

    return filtered;
  }, [localTasks, filters, sortField, sortOrder]);

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
    getTasks(supabase, boardId).then(setLocalTasks);
  }

  // Check if filters are active
  const hasActiveFilters =
    filters.search ||
    filters.priorities.size > 0 ||
    filters.statuses.size > 0 ||
    filters.assignees.size > 0 ||
    filters.dateFilter !== 'all';

  // Reset page when filters change - handled in individual filter setters

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

  function renderPriority(priority: TaskPriority | null) {
    const getPriorityIcon = () => {
      switch (priority) {
        case 'critical':
          return '🔥';
        case 'high':
          return '⬆️';
        case 'normal':
          return '➡️';
        case 'low':
          return '⬇️';
        default:
          return null;
      }
    };

    return (
      <Badge
        variant="outline"
        className={cn(
          'gap-1.5 font-medium shadow-sm transition-all',
          priorityColors[priority as keyof typeof priorityColors]
        )}
      >
        {getPriorityIcon() && <span>{getPriorityIcon()}</span>}
        {priorityLabels[priority as keyof typeof priorityLabels]}
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
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      {/* Header Section */}
      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-gradient-to-r from-dynamic-orange/5 via-card to-card p-4 shadow-sm backdrop-blur-sm md:p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-orange/10 ring-1 ring-dynamic-orange/20 md:h-12 md:w-12">
            <List className="h-5 w-5 text-dynamic-orange md:h-6 md:w-6" />
          </div>
          <div>
            <h2 className="font-bold text-foreground text-lg tracking-tight md:text-xl">
              Task List
            </h2>
            <p className="text-muted-foreground text-xs md:text-sm">
              Manage and organize your tasks
            </p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 rounded-xl border border-border/60 bg-background p-4 shadow-sm backdrop-blur-sm transition-shadow hover:shadow-md md:p-6">
        {/* Search and Actions Row */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tasks by name or description..."
              value={filters.search}
              onChange={(e) =>
                setFilters({ ...filters, search: e.target.value })
              }
              className="h-10 border-border/60 bg-background/50 pr-9 pl-9 shadow-sm backdrop-blur-sm transition-all focus:border-primary/50 focus:shadow-md"
            />
            {filters.search && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters({ ...filters, search: '' })}
                className="-translate-y-1/2 absolute top-1/2 right-1 h-7 w-7 p-0 hover:bg-muted"
              >
                <X className="h-3 w-3" />
                <span className="sr-only">Clear search</span>
              </Button>
            )}
          </div>

          {/* Table Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Priority Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-9 gap-2 px-3 text-xs shadow-sm transition-all',
                    filters.priorities.size > 0
                      ? 'border-dynamic-orange/50 bg-dynamic-orange/10 font-semibold text-dynamic-orange shadow-dynamic-orange/20 hover:bg-dynamic-orange/15'
                      : 'hover:border-primary/30 hover:bg-muted/50'
                  )}
                >
                  <Flag className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Priority</span>
                  {filters.priorities.size > 0 && (
                    <Badge
                      variant="secondary"
                      className="h-5 w-5 rounded-full bg-dynamic-orange p-0 font-bold text-[10px] text-white"
                    >
                      {filters.priorities.size}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-48 overflow-y-auto"
              >
                {filterOptions.priorities.map((priority) => (
                  <DropdownMenuItem
                    key={priority}
                    onClick={() => {
                      const newPriorities = new Set(filters.priorities);
                      if (newPriorities.has(priority)) {
                        newPriorities.delete(priority);
                      } else {
                        newPriorities.add(priority);
                      }
                      setFilters((prev) => ({
                        ...prev,
                        priorities: newPriorities,
                      }));
                    }}
                    className="cursor-pointer"
                  >
                    <Checkbox
                      checked={filters.priorities.has(priority)}
                      className="mr-2 h-3.5 w-3.5"
                    />
                    <Flag className="mr-2 h-3.5 w-3.5" />
                    {priorityLabels[priority as keyof typeof priorityLabels]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Status Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-9 gap-2 px-3 text-xs shadow-sm transition-all',
                    filters.statuses.size > 0
                      ? 'border-dynamic-green/50 bg-dynamic-green/10 font-semibold text-dynamic-green shadow-dynamic-green/20 hover:bg-dynamic-green/15'
                      : 'hover:border-primary/30 hover:bg-muted/50'
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Status</span>
                  {filters.statuses.size > 0 && (
                    <Badge
                      variant="secondary"
                      className="h-5 w-5 rounded-full bg-dynamic-green p-0 font-bold text-[10px] text-white"
                    >
                      {filters.statuses.size}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-48 overflow-y-auto"
              >
                {filterOptions.statuses.map((status) => (
                  <DropdownMenuItem
                    key={status}
                    onClick={() => {
                      const newStatuses = new Set(filters.statuses);
                      if (newStatuses.has(status)) {
                        newStatuses.delete(status);
                      } else {
                        newStatuses.add(status);
                      }
                      setFilters((prev) => ({
                        ...prev,
                        statuses: newStatuses,
                      }));
                    }}
                    className="cursor-pointer"
                  >
                    <Checkbox
                      checked={filters.statuses.has(status)}
                      className="mr-2 h-3.5 w-3.5"
                    />
                    <span className="capitalize">{status}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Assignee Filter */}
            {!isPersonalWorkspace && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'h-9 gap-2 px-3 text-xs shadow-sm transition-all',
                      filters.assignees.size > 0
                        ? 'border-dynamic-blue/50 bg-dynamic-blue/10 font-semibold text-dynamic-blue shadow-dynamic-blue/20 hover:bg-dynamic-blue/15'
                        : 'hover:border-primary/30 hover:bg-muted/50'
                    )}
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Assignees</span>
                    {filters.assignees.size > 0 && (
                      <Badge
                        variant="secondary"
                        className="h-5 w-5 rounded-full bg-dynamic-blue p-0 font-bold text-[10px] text-white"
                      >
                        {filters.assignees.size}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-64 w-56">
                  <div className="max-h-48 overflow-y-auto">
                    {/* All option */}
                    <DropdownMenuItem
                      onClick={() => {
                        const newAssignees = new Set(filters.assignees);
                        if (newAssignees.has('all')) {
                          newAssignees.delete('all');
                        } else {
                          newAssignees.clear();
                          newAssignees.add('all');
                        }
                        setFilters((prev) => ({
                          ...prev,
                          assignees: newAssignees,
                        }));
                      }}
                      className="cursor-pointer"
                    >
                      <Checkbox
                        checked={filters.assignees.has('all')}
                        className="mr-2 h-3.5 w-3.5"
                      />
                      <span>All tasks</span>
                    </DropdownMenuItem>

                    {/* Unassigned option */}
                    <DropdownMenuItem
                      onClick={() => {
                        const newAssignees = new Set(filters.assignees);
                        if (newAssignees.has('unassigned')) {
                          newAssignees.delete('unassigned');
                        } else {
                          newAssignees.add('unassigned');
                        }
                        setFilters((prev) => ({
                          ...prev,
                          assignees: newAssignees,
                        }));
                      }}
                      className="cursor-pointer"
                    >
                      <Checkbox
                        checked={filters.assignees.has('unassigned')}
                        className="mr-2 h-3.5 w-3.5"
                      />
                      <span>Unassigned</span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    {/* Individual members */}
                    {members.map((member: Member) => (
                      <DropdownMenuItem
                        key={member.id}
                        onClick={() => {
                          const newAssignees = new Set(filters.assignees);
                          if (newAssignees.has(member.id)) {
                            newAssignees.delete(member.id);
                          } else {
                            newAssignees.add(member.id);
                          }
                          setFilters((prev) => ({
                            ...prev,
                            assignees: newAssignees,
                          }));
                        }}
                        className="cursor-pointer"
                      >
                        <Checkbox
                          checked={filters.assignees.has(member.id)}
                          className="mr-2 h-3.5 w-3.5"
                        />
                        <div className="flex items-center gap-2">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted font-medium text-xs">
                            {member.display_name?.trim()?.[0]?.toUpperCase() ||
                              member.email?.trim()?.[0]?.toUpperCase() ||
                              '?'}
                          </div>
                          <span className="truncate">
                            {member.display_name?.trim() ||
                              member.email?.trim() ||
                              'Unknown'}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </div>
                  {filters.assignees.size > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          setFilters((prev) => ({
                            ...prev,
                            assignees: new Set(),
                          }))
                        }
                        className="cursor-pointer text-muted-foreground"
                      >
                        Clear assignee filters
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Date Filter */}
            <Select
              value={filters.dateFilter}
              onValueChange={(
                value: 'all' | 'overdue' | 'today' | 'this_week' | 'no_date'
              ) => setFilters({ ...filters, dateFilter: value })}
            >
              <SelectTrigger
                className={cn(
                  'h-9 w-[140px] text-xs shadow-sm transition-all',
                  filters.dateFilter !== 'all'
                    ? 'border-dynamic-purple/50 bg-dynamic-purple/10 font-semibold text-dynamic-purple hover:bg-dynamic-purple/15'
                    : 'hover:border-primary/30 hover:bg-muted/50'
                )}
              >
                <Calendar className="mr-2 h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-auto">
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
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 p-0 shadow-sm transition-all hover:border-primary/30 hover:bg-muted/50"
                >
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
                {!isPersonalWorkspace && (
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
                )}
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
                className="h-9 gap-2 text-dynamic-red text-xs shadow-sm transition-all hover:bg-dynamic-red/10 hover:text-dynamic-red"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
            )}
          </div>
        </div>

        {/* Results and Filter Summary */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 shadow-sm backdrop-blur-sm">
              <span className="font-semibold text-foreground text-sm">
                {filteredAndSortedTasks.length}
              </span>
              <span className="text-muted-foreground text-xs">of</span>
              <span className="text-muted-foreground text-sm">
                {tasks.length} task{tasks.length !== 1 ? 's' : ''}
              </span>
            </div>
            {hasActiveFilters && (
              <Badge
                variant="secondary"
                className="bg-dynamic-blue/10 px-2 py-1 font-medium text-dynamic-blue text-xs"
              >
                {filteredAndSortedTasks.length !== tasks.length
                  ? 'Filtered'
                  : 'All shown'}
              </Badge>
            )}
          </div>

          {/* Page Size */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Rows per page</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[70px] border-border/60 text-xs shadow-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64 overflow-y-auto">
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
        <div className="flex flex-1 flex-col items-center justify-center gap-6 rounded-lg border bg-card p-12 text-center shadow-sm">
          <div className="rounded-full bg-muted/50 p-8">
            <Search className="h-10 w-10 text-muted-foreground" />
          </div>
          <div className="space-y-3">
            <h3 className="font-semibold text-xl">
              {filters.search ? 'No tasks found' : 'No tasks yet'}
            </h3>
            <p className="max-w-md text-muted-foreground">
              {filters.search
                ? `No tasks match "${filters.search}". Try adjusting your search terms or filters.`
                : 'Get started by creating your first task in the board view.'}
            </p>
          </div>
          {(filters.search || hasActiveFilters) && (
            <Button
              variant="outline"
              onClick={clearAllFilters}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Clear all filters
            </Button>
          )}
        </div>
      ) : (
        <div className="relative flex-1 overflow-auto rounded-xl border border-border/60 bg-card shadow-md backdrop-blur-sm">
          <TooltipProvider>
            <Table>
              <TableHeader className="sticky top-0 z-10 border-border/60 border-b bg-background backdrop-blur-md">
                <TableRow className="border-b hover:bg-transparent">
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
                      <div className="flex items-center justify-center gap-1">
                        <span className="font-medium text-muted-foreground text-xs">
                          Status
                        </span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 hover:bg-muted"
                            >
                              <HelpCircle className="h-3 w-3" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80">
                            <div className="space-y-2">
                              <h4 className="font-medium">Task Completion</h4>
                              <p className="text-muted-foreground text-sm">
                                Tasks can be completed in two ways:
                              </p>
                              <ul className="space-y-1 text-muted-foreground text-sm">
                                <li>
                                  • <strong>Individual checkbox:</strong> Mark
                                  task as done
                                </li>
                                <li>
                                  • <strong>Move to Done list:</strong>{' '}
                                  Automatically marks task as done
                                </li>
                              </ul>
                              <p className="text-muted-foreground text-xs">
                                The amber dot indicates a task in a
                                &quot;Done&quot; list that hasn&apos;t been
                                individually checked.
                              </p>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
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
                  {columnVisibility.actions && (
                    <TableHead className="w-[50px]" />
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTasks.map((task) => (
                  <TableRow
                    key={task.id}
                    className={cn(
                      'group cursor-pointer transition-all hover:bg-muted/50 hover:shadow-sm',
                      task.archived && 'opacity-60',
                      selectedTasks.has(task.id) && 'bg-muted/50 shadow-sm',
                      task.end_date &&
                        new Date(task.end_date) < new Date() &&
                        !task.archived &&
                        'border-l-2 border-l-dynamic-red/50'
                    )}
                    onClick={(e) => {
                      // Don't open if clicking on checkbox or action button
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
                            className={cn(
                              'font-medium leading-none transition-colors group-hover:text-primary',
                              {
                                'text-muted-foreground line-through':
                                  task.archived,
                              }
                            )}
                          >
                            {task.name}
                          </div>
                          {task.description &&
                            getDescriptionText(task.description) && (
                              <p className="scrollbar-none group-hover:scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/30 group-hover:scrollbar-thumb-muted-foreground/50 line-clamp-1 max-h-20 overflow-y-auto whitespace-pre-line text-muted-foreground text-sm leading-relaxed">
                                {getDescriptionText(task.description)}
                              </p>
                            )}
                          {task.labels && task.labels.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 pt-1">
                              {task.labels.slice(0, 3).map((label) => (
                                <Badge
                                  key={label.id}
                                  variant="outline"
                                  style={{
                                    backgroundColor: `color-mix(in srgb, ${label.color} 15%, transparent)`,
                                    borderColor: `color-mix(in srgb, ${label.color} 30%, transparent)`,
                                    color: label.color,
                                  }}
                                  className="text-xs"
                                >
                                  {label.name}
                                </Badge>
                              ))}
                              {task.labels.length > 3 && (
                                <Badge variant="secondary" className="text-xs">
                                  +{task.labels.length - 3}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                    )}
                    {columnVisibility.priority && (
                      <TableCell>
                        {renderPriority(task.priority ?? null)}
                      </TableCell>
                    )}
                    {columnVisibility.start_date && (
                      <TableCell>
                        {task.start_date
                          ? renderDateCell(task.start_date)
                          : null}
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
                        {task.assignees && task.assignees.length > 0 ? (
                          <div className="-space-x-2 flex">
                            {task.assignees.slice(0, 3).map((assignee) => (
                              <div
                                key={assignee.id}
                                className="relative inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-background bg-muted ring-1 ring-border transition-transform hover:z-10 hover:scale-110"
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
                                    width={28}
                                    height={28}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="font-medium text-xs">
                                    {(
                                      assignee.display_name ||
                                      assignee.email ||
                                      '?'
                                    )
                                      .slice(0, 2)
                                      .toUpperCase()}
                                  </span>
                                )}
                              </div>
                            ))}
                            {task.assignees.length > 3 && (
                              <div
                                className="relative inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border-2 border-background bg-muted ring-1 ring-border"
                                title={`+${task.assignees.length - 3} more`}
                              >
                                <span className="font-medium text-xs">
                                  +{task.assignees.length - 3}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            Unassigned
                          </span>
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
          </TooltipProvider>
        </div>
      )}

      {/* Pagination */}
      {filteredAndSortedTasks.length > 0 && totalPages > 1 && (
        <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background p-4 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between md:p-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 shadow-sm backdrop-blur-sm">
              <span className="text-foreground text-sm">
                {(currentPage - 1) * pageSize + 1}-
                {Math.min(
                  currentPage * pageSize,
                  filteredAndSortedTasks.length
                )}
              </span>
              <span className="text-muted-foreground text-xs">of</span>
              <span className="text-muted-foreground text-sm">
                {filteredAndSortedTasks.length}
              </span>
            </div>
            {selectedTasks.size > 0 && (
              <Badge
                variant="secondary"
                className="bg-dynamic-orange/10 px-2.5 py-1 font-semibold text-dynamic-orange text-xs"
              >
                {selectedTasks.size} selected
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-1.5 shadow-sm backdrop-blur-sm">
              <span className="font-medium text-foreground text-sm">
                {currentPage}
              </span>
              <span className="text-muted-foreground text-xs">of</span>
              <span className="text-muted-foreground text-sm">
                {totalPages}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={!hasPreviousPage}
                className="h-9 w-9 p-0 shadow-sm transition-all hover:bg-muted/50 disabled:opacity-30"
                title="First page"
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={!hasPreviousPage}
                className="h-9 w-9 p-0 shadow-sm transition-all hover:bg-muted/50 disabled:opacity-30"
                title="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={!hasNextPage}
                className="h-9 w-9 p-0 shadow-sm transition-all hover:bg-muted/50 disabled:opacity-30"
                title="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={!hasNextPage}
                className="h-9 w-9 p-0 shadow-sm transition-all hover:bg-muted/50 disabled:opacity-30"
                title="Last page"
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
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
              variant="outline"
              size="sm"
              onClick={handleBulkEdit}
              className="h-8"
            >
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Edit
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
        />
      )}

      {/* Bulk Edit Dialog */}
      <Dialog open={isBulkEditing} onOpenChange={setIsBulkEditing}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Bulk Edit Tasks</DialogTitle>
            <DialogDescription>
              Update {selectedTasks.size} selected task
              {selectedTasks.size !== 1 ? 's' : ''}. Leave fields empty to keep
              current values.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="bulk-priority">Priority</Label>
              <Select
                value={bulkEditData.priority}
                onValueChange={(value) =>
                  setBulkEditData((prev) => ({ ...prev, priority: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Keep current priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Keep current</SelectItem>
                  <SelectItem value="critical">🔥 Urgent</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="normal">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bulk-status">Status</Label>
              <Select
                value={bulkEditData.status}
                onValueChange={(value) =>
                  setBulkEditData((prev) => ({ ...prev, status: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Keep current status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Keep current</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsBulkEditing(false);
                setBulkEditData({ priority: 'keep', status: 'keep' });
              }}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkEditSave}
              disabled={
                isLoading ||
                (bulkEditData.priority === 'keep' &&
                  bulkEditData.status === 'keep')
              }
            >
              {isLoading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Tasks'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
