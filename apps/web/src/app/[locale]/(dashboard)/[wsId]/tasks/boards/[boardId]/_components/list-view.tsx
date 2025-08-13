'use client';

import { TaskEditDialog } from './task-edit-dialog';
import { getTagColorStyling } from '@/lib/tag-utils';
import { getTasks, priorityCompare } from '@/lib/task-helper';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { Json } from '@tuturuuu/types/supabase';
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
  Clock,
  Flag,
  HelpCircle,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings2,
  Tag,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import {
  addDays,
  format,
  isPast,
  isToday,
  isTomorrow,
  isWithinInterval,
} from 'date-fns';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

interface Props {
  board: { id: string; tasks: Task[]; lists?: TaskList[] };
  selectedTags?: string[];
  onTagsChange?: (tags: string[]) => void;
}

type SortField =
  | 'name'
  | 'priority'
  | 'start_date'
  | 'end_date'
  | 'assignees'
  | 'created_at'
  | 'status'
  | 'tags';
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
  tags: boolean;
  actions: boolean;
}

interface Member {
  id: string;
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

interface TaskBulkUpdate {
  id: string;
  priority?: TaskPriority | null;
  archived?: boolean;
  tags?: string[];
  [key: string]: Json | string[] | number | boolean | null | undefined;
}

// Priority labels constant - defined once outside component for performance
const priorityLabels = {
  critical: 'Urgent',
  high: 'High',
  normal: 'Medium',
  low: 'Low',
  null: 'No Priority',
};

const priorityColors = {
  critical:
    'border-pink-600 bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
  high: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  normal:
    'border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  low: 'border-green-500 bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  null: 'border-gray-300 bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const SKELETON_KEYS: string[] = ['a', 'b', 'c', 'd', 'e'];

export function ListView({
  board,
  selectedTags = [],
  onTagsChange = () => {},
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
    tags: true,
    actions: true,
  });

  // Bulk actions state
  const [isBulkEditing, setIsBulkEditing] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({
    priority: 'keep',
    status: 'keep',
    tags: [] as string[],
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

      // Prepare updates array for RPC
      const updates: TaskBulkUpdate[] = taskIds.map((id) => {
        const updateObj: TaskBulkUpdate = { id };
        if (bulkEditData.priority !== 'keep') {
          updateObj.priority = bulkEditData.priority as TaskPriority | null;
        }
        if (bulkEditData.status !== 'keep') {
          updateObj.archived = bulkEditData.status === 'completed';
        }
        if (bulkEditData.tags.length > 0) {
          updateObj.tags = bulkEditData.tags;
        }
        return updateObj;
      });

      // Check if any updates have meaningful changes (more than just the id field)
      const hasUpdates = updates.some(
        (obj) =>
          obj.priority !== undefined ||
          obj.archived !== undefined ||
          obj.tags !== undefined
      );

      if (hasUpdates) {
        // Only call RPC if at least one field is being updated
        const { error } = await supabase.rpc('update_many_tasks', { updates });
        if (error) throw error;
      }

      // Refresh the task list and invalidate cache
      const updatedTasks = await getTasks(supabase, board.id);
      setTasks(updatedTasks);
      queryClient.invalidateQueries({ queryKey: ['tasks', board.id] });
      setSelectedTasks(new Set());
      setIsBulkEditing(false);
      setBulkEditData({ priority: 'keep', status: 'keep', tags: [] });
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
      const updatedTasks = await getTasks(supabase, board.id);
      setTasks(updatedTasks);
      queryClient.invalidateQueries({ queryKey: ['tasks', board.id] });
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
          if (mounted) {
            setTasks(tasks);
            queryClient.invalidateQueries({ queryKey: ['tasks', board.id] });
          }
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
          if (mounted) {
            setTasks(tasks);
            queryClient.invalidateQueries({ queryKey: ['tasks', board.id] });
          }
        }
      )
      .subscribe();

    loadData();

    return () => {
      mounted = false;
      tasksSubscription.unsubscribe();
    };
  }, [board.id, queryClient]);

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

    tasks.forEach((task) => {
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

  // Extract unique tags from tasks
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    tasks.forEach((task) => {
      if (task.tags && Array.isArray(task.tags)) {
        task.tags.forEach((tag) => {
          if (tag && typeof tag === 'string') {
            tagSet.add(tag);
          }
        });
      }
    });
    return Array.from(tagSet).sort();
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

      // Tag filter
      if (selectedTags.length > 0) {
        if (!task.tags || task.tags.length === 0) {
          return false;
        }
        // Check if task has any of the selected tags
        const hasMatchingTag = selectedTags.some(
          (selectedTag) => task.tags?.includes(selectedTag) ?? false
        );
        if (!hasMatchingTag) return false;
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
        case 'tags': {
          const aLength = a.tags?.length || 0;
          const bLength = b.tags?.length || 0;
          comparison = aLength - bLength;
          break;
        }
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    return filtered;
  }, [tasks, filters, sortField, sortOrder, selectedTags]);

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
    onTagsChange([]); // Clear tag filters
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
    filters.dateFilter !== 'all' ||
    selectedTags.length > 0;

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
      board.lists?.some(
        (list) => list.id === task.list_id && list.status === 'done'
      );

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
    return (
      <Badge
        variant="outline"
        className={cn(
          'font-medium',
          priorityColors[priority as keyof typeof priorityColors]
        )}
      >
        {priorityLabels[priority as keyof typeof priorityLabels]}
      </Badge>
    );
  }

  const MAX_VISIBLE_TAGS = 3;

  function renderTags(tags: string[] | null) {
    if (!tags || tags.length === 0) {
      return <span className="text-sm text-muted-foreground">—</span>;
    }

    const needsScroll = tags.length >= 10;

    return (
      <div className="flex flex-wrap gap-1">
        {tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => {
          const { style, className: tagClassName } = getTagColorStyling(tag);
          return (
            <Badge
              key={tag}
              variant="outline"
              className={cn(
                'h-5 rounded-full border px-1.5 text-xs font-medium',
                'max-w-[100px] truncate transition-all duration-200',
                'hover:scale-105 hover:brightness-110',
                tagClassName
              )}
              style={style}
              title={tag.length > 12 ? tag : undefined}
            >
              {tag}
            </Badge>
          );
        })}
        {tags.length > MAX_VISIBLE_TAGS && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="h-5 cursor-help rounded-full border px-1.5 text-xs font-medium transition-all duration-200 hover:scale-105 hover:bg-muted/50"
              >
                +{tags.length - MAX_VISIBLE_TAGS}
              </Badge>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className={cn('max-w-sm p-0', needsScroll && 'max-h-64')}
              sideOffset={8}
            >
              <div className="space-y-3 p-4">
                <p className="text-sm font-medium text-foreground">All tags:</p>
                <div
                  className={cn(
                    'flex flex-wrap gap-1.5',
                    needsScroll && 'max-h-48 overflow-y-auto pr-2'
                  )}
                >
                  {tags.map((tag) => {
                    const { style, className: tagClassName } =
                      getTagColorStyling(tag);
                    return (
                      <Badge
                        key={tag}
                        variant="outline"
                        className={cn(
                          'h-auto rounded-full border px-2 py-0.5 text-xs font-medium',
                          'max-w-[140px] truncate transition-all duration-200',
                          'hover:scale-105 hover:brightness-110',
                          tagClassName
                        )}
                        style={style}
                        title={tag.length > 18 ? tag : undefined}
                      >
                        {tag}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
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
            {/* Tag Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-8 gap-1.5 px-3 text-xs',
                    selectedTags.length > 0 &&
                      'border-primary bg-primary/5 text-primary hover:bg-primary/10'
                  )}
                >
                  <Tag className="h-3.5 w-3.5" />
                  Tags
                  {selectedTags.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1 h-4 w-4 rounded-full p-0 text-xs"
                    >
                      {selectedTags.length}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-64 w-56 overflow-y-auto"
              >
                <div className="max-h-48 overflow-y-auto">
                  {availableTags.map((tag) => (
                    <DropdownMenuItem
                      key={tag}
                      onClick={() => {
                        const newTags = selectedTags.includes(tag)
                          ? selectedTags.filter((t) => t !== tag)
                          : [...selectedTags, tag];
                        onTagsChange(newTags);
                      }}
                      className="cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedTags.includes(tag)}
                        className="mr-2 h-3.5 w-3.5"
                      />
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-xs',
                          getTagColorStyling(tag).className
                        )}
                        style={getTagColorStyling(tag).style}
                      >
                        {tag}
                      </Badge>
                    </DropdownMenuItem>
                  ))}
                </div>
                {selectedTags.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onTagsChange([])}
                      className="cursor-pointer text-muted-foreground"
                    >
                      Clear all tags
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Priority Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-8 gap-1.5 px-3 text-xs',
                    filters.priorities.size > 0 &&
                      'border-primary bg-primary/5 text-primary hover:bg-primary/10'
                  )}
                >
                  <Flag className="h-3.5 w-3.5" />
                  Priority
                  {filters.priorities.size > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1 h-4 w-4 rounded-full p-0 text-xs"
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
                    'h-8 gap-1.5 px-3 text-xs',
                    filters.statuses.size > 0 &&
                      'border-primary bg-primary/5 text-primary hover:bg-primary/10'
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Status
                  {filters.statuses.size > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1 h-4 w-4 rounded-full p-0 text-xs"
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-8 gap-1.5 px-3 text-xs',
                    filters.assignees.size > 0 &&
                      'border-primary bg-primary/5 text-primary hover:bg-primary/10'
                  )}
                >
                  <Users className="h-3.5 w-3.5" />
                  Assignees
                  {filters.assignees.size > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1 h-4 w-4 rounded-full p-0 text-xs"
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
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-medium">
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

            {/* Date Filter */}
            <Select
              value={filters.dateFilter}
              onValueChange={(
                value: 'all' | 'overdue' | 'today' | 'this_week' | 'no_date'
              ) => setFilters({ ...filters, dateFilter: value })}
            >
              <SelectTrigger className="h-8 w-[130px]">
                <Calendar className="mr-2 h-4 w-4" />
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
                <DropdownMenuCheckboxItem
                  checked={columnVisibility.tags}
                  onCheckedChange={(checked) =>
                    setColumnVisibility({
                      ...columnVisibility,
                      tags: checked,
                    })
                  }
                >
                  Tags
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
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="rounded-full bg-muted p-6">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">
              {filters.search || selectedTags.length > 0
                ? 'No tasks found'
                : 'No tasks yet'}
            </h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              {filters.search
                ? `No tasks match "${filters.search}". Try adjusting your search terms.`
                : selectedTags.length > 0
                  ? `No tasks match the selected tags. Try adjusting your filters.`
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
          <TooltipProvider>
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
                      <div className="flex items-center justify-center gap-1">
                        <span className="text-xs font-medium text-muted-foreground">
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
                              <p className="text-sm text-muted-foreground">
                                Tasks can be completed in two ways:
                              </p>
                              <ul className="space-y-1 text-sm text-muted-foreground">
                                <li>
                                  • <strong>Individual checkbox:</strong> Mark
                                  task as done
                                </li>
                                <li>
                                  • <strong>Move to Done list:</strong>{' '}
                                  Automatically marks task as done
                                </li>
                              </ul>
                              <p className="text-xs text-muted-foreground">
                                The amber dot indicates a task in a "Done" list
                                that hasn't been individually checked.
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
                  {columnVisibility.tags && (
                    <TableHead className="w-[100px]">
                      <Button
                        variant="ghost"
                        className={cn(
                          '-ml-4 h-8 justify-start hover:bg-transparent',
                          sortField === 'tags' && 'text-foreground'
                        )}
                        onClick={() => handleSort('tags')}
                      >
                        <Tag className="h-4 w-4" />
                        <span className="font-medium">Tags</span>
                        {getSortIcon('tags')}
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
                              'text-muted-foreground line-through':
                                task.archived,
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
                    {columnVisibility.tags && (
                      <TableCell>{renderTags(task.tags || null)}</TableCell>
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
            <Button variant="outline" size="sm" onClick={handleBulkEdit}>
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Task Edit Dialog */}
      {selectedTask && (
        <TaskEditDialog
          task={selectedTask}
          isOpen={!!selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onUpdate={() => {
            setSelectedTaskId(null);
            const supabase = createClient();
            getTasks(supabase, board.id).then(setTasks);
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
                  <SelectItem value="0">No Priority</SelectItem>
                  <SelectItem value="1">Urgent</SelectItem>
                  <SelectItem value="2">High</SelectItem>
                  <SelectItem value="3">Medium</SelectItem>
                  <SelectItem value="4">Low</SelectItem>
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
            <div className="grid gap-2">
              <Label htmlFor="bulk-tags">Tags</Label>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => (
                  <Button
                    key={tag}
                    variant={
                      bulkEditData.tags.includes(tag) ? 'default' : 'outline'
                    }
                    size="sm"
                    onClick={() => {
                      const newTags = bulkEditData.tags.includes(tag)
                        ? bulkEditData.tags.filter((t) => t !== tag)
                        : [...bulkEditData.tags, tag];
                      setBulkEditData((prev) => ({ ...prev, tags: newTags }));
                    }}
                    className="h-7 text-xs"
                  >
                    {tag}
                  </Button>
                ))}
              </div>
              {bulkEditData.tags.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setBulkEditData((prev) => ({ ...prev, tags: [] }))
                  }
                  className="h-7 text-xs text-muted-foreground"
                >
                  Clear all tags
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsBulkEditing(false);
                setBulkEditData({ priority: 'keep', status: 'keep', tags: [] });
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
                  bulkEditData.status === 'keep' &&
                  bulkEditData.tags.length === 0)
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
