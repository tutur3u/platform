'use client';

import { useState, useMemo, useCallback } from 'react';
import type { Task } from '@tuturuuu/types/primitives/TaskBoard';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
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
  ArrowUpDown,
  Calendar,
  Circle,
  Clock,
  Filter,
  Flag,
  MoreHorizontal,
  Search,
  Users,
  X,
} from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { format, isToday, isTomorrow, isPast } from 'date-fns';

// Types
export type TaskViewMode = 'list' | 'board' | 'table';
export type TaskSortField = 'name' | 'priority' | 'end_date' | 'created_at';
export type TaskSortOrder = 'asc' | 'desc';

export interface TaskFilters {
  search: string;
  priorities: number[];
  statuses: string[];
  assignees: string[];
  dateRange: 'all' | 'overdue' | 'today' | 'this_week' | 'no_date';
}

export interface ModernTaskListProps {
  tasks: Task[];
  loading?: boolean;
  viewMode?: TaskViewMode;
  onTaskSelect?: (taskId: string) => void;
  onTasksSelect?: (taskIds: string[]) => void;
  onTaskAction?: (action: string, taskId: string) => void;
  onBulkAction?: (action: string, taskIds: string[]) => void;
  className?: string;
}

// Constants
const PRIORITY_LABELS = {
  1: { label: 'High', color: 'red' },
  2: { label: 'Medium', color: 'yellow' },
  3: { label: 'Low', color: 'green' },
} as const;

const DEFAULT_FILTERS: TaskFilters = {
  search: '',
  priorities: [],
  statuses: [],
  assignees: [],
  dateRange: 'all',
};

// Utility functions
const formatTaskDate = (date: string | undefined | null): string => {
  if (!date) return '';
  
  try {
    const taskDate = new Date(date);
    if (isToday(taskDate)) return 'Today';
    if (isTomorrow(taskDate)) return 'Tomorrow';
    if (isPast(taskDate)) return `${format(taskDate, 'MMM d')} (overdue)`;
    return format(taskDate, 'MMM d');
  } catch {
    return '';
  }
};

const getTaskPriority = (priority: number | null | undefined) => {
  if (!priority || !(priority in PRIORITY_LABELS)) return null;
  return PRIORITY_LABELS[priority as keyof typeof PRIORITY_LABELS];
};

// Sub-components
interface TaskItemProps {
  task: Task;
  selected?: boolean;
  onSelect?: (taskId: string) => void;
  onAction?: (action: string, taskId: string) => void;
}

const TaskItem = ({ task, selected, onSelect, onAction }: TaskItemProps) => {
  const priority = getTaskPriority(task.priority);
  const endDate = formatTaskDate(task.end_date);
  const isOverdue = task.end_date && isPast(new Date(task.end_date)) && !task.archived;

  return (
    <div
      className={cn(
        'group flex items-center gap-3 p-4 border rounded-lg bg-white hover:bg-gray-50 transition-colors',
        selected && 'ring-2 ring-blue-500 ring-opacity-50',
        isOverdue && 'border-red-200 bg-red-50/50',
        task.archived && 'opacity-60'
      )}
    >
      {/* Selection checkbox */}
      <Checkbox
        checked={selected}
        onCheckedChange={() => onSelect?.(task.id)}
        aria-label={`Select task ${task.name}`}
      />

      {/* Task content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {/* Task name */}
          <h3 className={cn(
            'font-medium text-gray-900 truncate',
            task.archived && 'line-through text-gray-500'
          )}>
            {task.name}
          </h3>

          {/* Priority badge */}
          {priority && (
            <Badge
              variant="outline"
              className={cn(
                'text-xs',
                priority.color === 'red' && 'border-red-200 text-red-700 bg-red-50',
                priority.color === 'yellow' && 'border-yellow-200 text-yellow-700 bg-yellow-50',
                priority.color === 'green' && 'border-green-200 text-green-700 bg-green-50'
              )}
            >
              <Flag className="w-3 h-3 mr-1" />
              {priority.label}
            </Badge>
          )}
        </div>

        {/* Task description */}
        {task.description && (
          <p className="text-sm text-gray-600 line-clamp-2 mb-2">
            {task.description}
          </p>
        )}

        {/* Task metadata */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          {/* Due date */}
          {endDate && (
            <div className={cn(
              'flex items-center gap-1',
              isOverdue && 'text-red-600'
            )}>
              <Calendar className="w-3 h-3" />
              {endDate}
            </div>
          )}

          {/* Assignees */}
          {task.assignees && task.assignees.length > 0 && (
            <div className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              <span>{task.assignees.length} assigned</span>
            </div>
          )}

          {/* Created date */}
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {format(new Date(task.created_at), 'MMM d')}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Task actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onAction?.('edit', task.id)}>
              Edit task
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction?.('duplicate', task.id)}>
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onAction?.(task.archived ? 'unarchive' : 'archive', task.id)}
            >
              {task.archived ? 'Unarchive' : 'Archive'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onAction?.('delete', task.id)}
              className="text-red-600"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

// Main component
export function ModernTaskList({
  tasks,
  loading = false,
  onTaskSelect,
  onTasksSelect,
  onTaskAction,
  onBulkAction,
  className,
}: ModernTaskListProps) {
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [sortField, setSortField] = useState<TaskSortField>('created_at');
  const [sortOrder, setSortOrder] = useState<TaskSortOrder>('desc');

  // Filter and sort tasks
  const filteredAndSortedTasks = useMemo(() => {
    let filtered = tasks.filter((task) => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        if (
          !task.name.toLowerCase().includes(searchLower) &&
          !task.description?.toLowerCase().includes(searchLower)
        ) {
          return false;
        }
      }

      // Priority filter
      if (filters.priorities.length > 0 && task.priority) {
        if (!filters.priorities.includes(task.priority)) {
          return false;
        }
      }

      // Date range filter
      if (filters.dateRange !== 'all') {
        if (filters.dateRange === 'no_date' && task.end_date) return false;
        if (filters.dateRange === 'overdue' && (!task.end_date || !isPast(new Date(task.end_date)))) return false;
        if (filters.dateRange === 'today' && (!task.end_date || !isToday(new Date(task.end_date)))) return false;
        // Add more date filters as needed
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
        case 'priority':
          comparison = (a.priority || 0) - (b.priority || 0);
          break;
        case 'end_date':
          const dateA = a.end_date ? new Date(a.end_date).getTime() : 0;
          const dateB = b.end_date ? new Date(b.end_date).getTime() : 0;
          comparison = dateA - dateB;
          break;
        case 'created_at':
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [tasks, filters, sortField, sortOrder]);

  // Handlers
  const handleTaskSelect = useCallback(
    (taskId: string) => {
      const newSelected = new Set(selectedTasks);
      if (newSelected.has(taskId)) {
        newSelected.delete(taskId);
      } else {
        newSelected.add(taskId);
      }
      setSelectedTasks(newSelected);
      onTasksSelect?.(Array.from(newSelected));
      onTaskSelect?.(taskId);
    },
    [selectedTasks, onTasksSelect, onTaskSelect]
  );

  const handleSelectAll = useCallback(() => {
    const allTaskIds = filteredAndSortedTasks.map((task) => task.id);
    const newSelected = selectedTasks.size === allTaskIds.length ? new Set<string>() : new Set<string>(allTaskIds);
    setSelectedTasks(newSelected);
    onTasksSelect?.(Array.from(newSelected));
  }, [filteredAndSortedTasks, selectedTasks, onTasksSelect]);

  const handleSort = useCallback((field: TaskSortField) => {
    if (field === sortField) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }, [sortField, sortOrder]);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  // Stats
  const stats = useMemo(() => {
    const total = filteredAndSortedTasks.length;
    const completed = filteredAndSortedTasks.filter((task) => task.archived).length;
    const overdue = filteredAndSortedTasks.filter((task) => 
      task.end_date && isPast(new Date(task.end_date)) && !task.archived
    ).length;

    return { total, completed, overdue };
  }, [filteredAndSortedTasks]);

  if (loading) {
    return (
      <div className={cn('space-y-4', className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with search and filters */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Tasks ({stats.total})
            </h2>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Badge variant="secondary">{stats.completed} completed</Badge>
              {stats.overdue > 0 && (
                <Badge variant="destructive">{stats.overdue} overdue</Badge>
              )}
            </div>
          </div>

          {/* Bulk actions */}
          {selectedTasks.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">
                {selectedTasks.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onBulkAction?.('archive', Array.from(selectedTasks))}
              >
                Archive
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedTasks(new Set())}
              >
                Clear
              </Button>
            </div>
          )}
        </div>

        {/* Search and filters */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search tasks..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-10"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSort('end_date')}
            className="gap-2"
          >
            <ArrowUpDown className="h-4 w-4" />
            Sort by date
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-4 w-4" />
                Filter
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Filter by priority</DropdownMenuLabel>
              {Object.entries(PRIORITY_LABELS).map(([value, { label }]) => (
                <DropdownMenuCheckboxItem
                  key={value}
                  checked={filters.priorities.includes(Number(value))}
                  onCheckedChange={(checked) => {
                    const priority = Number(value);
                    setFilters({
                      ...filters,
                      priorities: checked
                        ? [...filters.priorities, priority]
                        : filters.priorities.filter((p) => p !== priority),
                    });
                  }}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Filter by date</DropdownMenuLabel>
              {[
                { value: 'all', label: 'All tasks' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'today', label: 'Due today' },
                { value: 'no_date', label: 'No due date' },
              ].map(({ value, label }) => (
                <DropdownMenuCheckboxItem
                  key={value}
                  checked={filters.dateRange === value}
                  onCheckedChange={() => {
                    setFilters({
                      ...filters,
                      dateRange: value as TaskFilters['dateRange'],
                    });
                  }}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {(filters.search || filters.priorities.length > 0 || filters.dateRange !== 'all') && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-2">
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>

        {/* Select all */}
        {filteredAndSortedTasks.length > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selectedTasks.size === filteredAndSortedTasks.length}
              onCheckedChange={handleSelectAll}
            />
            <span className="text-sm text-gray-600">
              Select all {filteredAndSortedTasks.length} tasks
            </span>
          </div>
        )}
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {filteredAndSortedTasks.length === 0 ? (
          <div className="text-center py-12">
            <Circle className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No tasks found</h3>
            <p className="text-gray-500">
              {filters.search || filters.priorities.length > 0 || filters.dateRange !== 'all'
                ? 'Try adjusting your filters to see more tasks.'
                : 'Create your first task to get started.'}
            </p>
            {(filters.search || filters.priorities.length > 0 || filters.dateRange !== 'all') && (
              <Button variant="outline" onClick={clearFilters} className="mt-4">
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          filteredAndSortedTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              selected={selectedTasks.has(task.id)}
              onSelect={handleTaskSelect}
              onAction={onTaskAction}
            />
          ))
        )}
      </div>
    </div>
  );
} 