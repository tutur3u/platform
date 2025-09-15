import { useDndMonitor } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQuery } from '@tanstack/react-query';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import {
  ArrowDownAZ,
  ArrowUpDown,
  Calendar,
  Check,
  Filter,
  Flag,
  GripVertical,
  RefreshCw,
  Search,
  Users,
  X,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { priorityCompare } from '@tuturuuu/utils/task-helper';
import { debounce } from 'lodash';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ListActions } from './list-actions';
import { statusIcons } from './status-section';
import { TaskCard } from './task';
import { TaskForm } from './task-form';

interface Props {
  column: TaskList;
  boardId: string;
  tasks: Task[];
  isOverlay?: boolean;
  onTaskCreated?: () => void;
  onListUpdated?: () => void;
  selectedTasks?: Set<string>;
  isMultiSelectMode?: boolean;
  isPersonalWorkspace?: boolean;
  onTaskSelect?: (taskId: string, event: React.MouseEvent) => void;
}

type SortOption =
  | 'none'
  | 'name'
  | 'priority'
  | 'due_date'
  | 'created_at'
  | 'alphabetical_desc'
  | 'priority_desc';
type SortDirection = 'asc' | 'desc';

type WorkspaceMember = Pick<
  WorkspaceUser,
  'id' | 'display_name' | 'email' | 'avatar_url'
>;

interface TaskListFilters {
  search: string;
  priorities: Set<TaskPriority>;
  assignees: Set<string>;
  overdue: boolean;
  dueSoon: boolean;
}

// Color mappings for visual consistency
const colorClasses: Record<SupportedColor, string> = {
  GRAY: 'border-l-dynamic-gray/50 bg-dynamic-gray/5',
  RED: 'border-l-dynamic-red/50 bg-dynamic-red/5',
  BLUE: 'border-l-dynamic-blue/50 bg-dynamic-blue/5',
  GREEN: 'border-l-dynamic-green/50 bg-dynamic-green/5',
  YELLOW: 'border-l-dynamic-yellow/50 bg-dynamic-yellow/5',
  ORANGE: 'border-l-dynamic-orange/50 bg-dynamic-orange/5',
  PURPLE: 'border-l-dynamic-purple/50 bg-dynamic-purple/5',
  PINK: 'border-l-dynamic-pink/50 bg-dynamic-pink/5',
  INDIGO: 'border-l-dynamic-indigo/50 bg-dynamic-indigo/5',
  CYAN: 'border-l-dynamic-cyan/50 bg-dynamic-cyan/5',
};

const FilterLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="font-medium text-xs">{children}</div>
);

export const BoardColumn = React.memo(function BoardColumn({
  column,
  boardId,
  tasks,
  isOverlay,
  onTaskCreated,
  onListUpdated,
  selectedTasks,
  onTaskSelect,
  isMultiSelectMode,
  isPersonalWorkspace,
}: Props) {
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

  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('none');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filters, setFilters] = useState<TaskListFilters>({
    search: '',
    priorities: new Set(),
    assignees: new Set(),
    overdue: false,
    dueSoon: false,
  });
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);
  const [sortPanelOpen, setSortPanelOpen] = useState(false);
  const [assigneesOpen, setAssigneesOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: column.id,
    data: {
      type: 'Column',
      column: {
        ...column,
        id: String(column.id),
      },
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Debounced search
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      setFilters((prev) => ({ ...prev, search: query }));
    }, 300),
    []
  );

  useEffect(() => {
    debouncedSearch(searchQuery);
    return () => {
      debouncedSearch.cancel();
    };
  }, [searchQuery, debouncedSearch]);

  // Filter and sort tasks for this column
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

      // Assignees filter
      if (filters.assignees.size > 0) {
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

      // Overdue filter
      if (filters.overdue) {
        if (!task.end_date || new Date(task.end_date) >= new Date()) {
          return false;
        }
      }

      // Due soon filter (next 7 days)
      if (filters.dueSoon) {
        if (!task.end_date) return false;
        const taskDueDate = new Date(task.end_date);
        const now = new Date();
        const sevenDaysFromNow = new Date();
        sevenDaysFromNow.setDate(now.getDate() + 7);
        if (taskDueDate < now || taskDueDate > sevenDaysFromNow) {
          return false;
        }
      }

      return true;
    });

    // Sort tasks
    if (sortBy !== 'none') {
      filtered.sort((a, b) => {
        let comparison = 0;

        switch (sortBy) {
          case 'name':
            comparison = a.name.localeCompare(b.name);
            break;
          case 'priority': {
            const aPriority = a.priority ?? null;
            const bPriority = b.priority ?? null;
            comparison = priorityCompare(aPriority, bPriority);
            break;
          }
          case 'due_date': {
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
          case 'alphabetical_desc': {
            comparison = b.name.localeCompare(a.name);
            break;
          }
          case 'priority_desc': {
            const aPriority = a.priority ?? null;
            const bPriority = b.priority ?? null;
            comparison = priorityCompare(bPriority, aPriority);
            break;
          }
        }

        return sortDirection === 'desc' ? -comparison : comparison;
      });
    } else {
      // Default sorting when no sort is selected
      filtered.sort((a, b) => {
        // First, sort by priority (no priority first, then urgent, high, medium, low)
        const priorityDiff = priorityCompare(a.priority, b.priority);
        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        // If priorities are the same, sort by due date
        // Tasks with due dates come before tasks without due dates
        if (a.end_date && b.end_date) {
          return (
            new Date(a.end_date).getTime() - new Date(b.end_date).getTime()
          );
        }
        if (a.end_date && !b.end_date) return -1;
        if (!a.end_date && b.end_date) return 1;

        // If both have same priority and same due date status, maintain original order
        return 0;
      });
    }

    return filtered;
  }, [tasks, filters, sortBy, sortDirection]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilters({
      search: '',
      priorities: new Set(),
      assignees: new Set(),
      overdue: false,
      dueSoon: false,
    });
    setSortBy('none');
  };

  const hasActiveFilters = Boolean(
    filters.search ||
      filters.priorities.size > 0 ||
      filters.assignees.size > 0 ||
      filters.overdue ||
      filters.dueSoon ||
      sortBy !== 'none'
  );

  const handleUpdate = () => {
    if (onListUpdated) onListUpdated();
    else if (onTaskCreated) onTaskCreated();
  };

  const handleTaskCreated = () => {
    if (onTaskCreated) onTaskCreated();
  };

  const colorClass =
    colorClasses[column.color as SupportedColor] || colorClasses.GRAY;
  const statusIcon = statusIcons[column.status];

  // Memoize drag handle for performance
  const DragHandle = useMemo(
    () => (
      <div
        {...attributes}
        {...listeners}
        className={cn(
          '-ml-2 h-auto cursor-grab p-1 opacity-40 transition-all',
          'hover:bg-black/5 group-hover:opacity-70',
          isDragging && 'opacity-100',
          isOverlay && 'cursor-grabbing'
        )}
        title="Drag to move list"
      >
        <span className="sr-only">Move list</span>
        <GripVertical className="h-4 w-4" />
      </div>
    ),
    [attributes, listeners, isDragging, isOverlay]
  );

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex h-full w-[350px] flex-col rounded-xl transition-all duration-200',
        'touch-none select-none',
        colorClass,
        isDragging &&
          'rotate-1 scale-[1.02] opacity-90 shadow-xl ring-2 ring-primary/20',
        isOverlay && 'shadow-2xl ring-2 ring-primary/30',
        'hover:shadow-md',
        // Visual feedback for invalid drop (dev only)
        DEV_MODE && isDragging && !isOverlay && 'ring-2 ring-red-400/60',
        'border-0'
      )}
    >
      <div className="flex items-center gap-2 rounded-t-xl border-b p-3">
        {DragHandle}
        <div className="flex flex-1 items-center gap-2">
          <span className="text-sm">{statusIcon}</span>
          <h3 className="font-semibold text-foreground/90 text-sm">
            {column.name}
          </h3>
          <Badge
            variant="secondary"
            className={cn(
              'px-2 py-0.5 font-medium text-xs',
              filteredAndSortedTasks.length === 0
                ? 'text-muted-foreground'
                : 'text-foreground'
            )}
          >
            {filteredAndSortedTasks.length}
            {filteredAndSortedTasks.length !== tasks.length && (
              <span className="ml-1 text-muted-foreground">
                /{tasks.length}
              </span>
            )}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {/* Filter/Sort Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-70 hover:opacity-100"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter
              className={cn('h-3 w-3', hasActiveFilters && 'text-primary')}
            />
          </Button>
          <ListActions
            listId={column.id}
            listName={column.name}
            listStatus={column.status}
            tasks={filteredAndSortedTasks}
            boardId={boardId}
            wsId={wsId}
            onUpdate={handleUpdate}
          />
        </div>
      </div>

      {/* Task-List Level Filters */}
      {showFilters && (
        <div className="space-y-2 border-b bg-muted/30 p-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute top-2 left-2 h-3 w-3 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 pr-7 pl-7 text-xs"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 h-5 w-5 rounded-full p-0 opacity-70 hover:opacity-100"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-2 w-2" />
              </Button>
            )}
          </div>

          {/* Controls Row */}
          <div className="flex items-center gap-1">
            {/* Sort */}
            <Popover open={sortPanelOpen} onOpenChange={setSortPanelOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={sortBy !== 'none' ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 gap-1 text-xs"
                >
                  <ArrowUpDown className="h-3 w-3" />
                  Sort
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Sort tasks by..." />
                  <CommandList>
                    <CommandEmpty>No sort options found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          setSortBy('none');
                          setSortPanelOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            sortBy === 'none' ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        Default (Priority + Due Date)
                      </CommandItem>
                      <CommandItem
                        onSelect={() => {
                          setSortBy('name');
                          setSortDirection('asc');
                          setSortPanelOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            sortBy === 'name' ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <ArrowDownAZ className="mr-2 h-4 w-4" />
                        Name (A-Z)
                      </CommandItem>
                      <CommandItem
                        onSelect={() => {
                          setSortBy('alphabetical_desc');
                          setSortDirection('asc');
                          setSortPanelOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            sortBy === 'alphabetical_desc'
                              ? 'opacity-100'
                              : 'opacity-0'
                          )}
                        />
                        <ArrowDownAZ className="mr-2 h-4 w-4 rotate-180" />
                        Name (Z-A)
                      </CommandItem>
                      <CommandItem
                        onSelect={() => {
                          setSortBy('priority');
                          setSortDirection('asc');
                          setSortPanelOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            sortBy === 'priority' ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <Flag className="mr-2 h-4 w-4" />
                        Priority (High to Low)
                      </CommandItem>
                      <CommandItem
                        onSelect={() => {
                          setSortBy('priority_desc');
                          setSortDirection('asc');
                          setSortPanelOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            sortBy === 'priority_desc'
                              ? 'opacity-100'
                              : 'opacity-0'
                          )}
                        />
                        <Flag className="mr-2 h-4 w-4" />
                        Priority (Low to High)
                      </CommandItem>
                      <CommandItem
                        onSelect={() => {
                          setSortBy('due_date');
                          setSortDirection('asc');
                          setSortPanelOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            sortBy === 'due_date' ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <Calendar className="mr-2 h-4 w-4" />
                        Due Date (Earliest first)
                      </CommandItem>
                      <CommandItem
                        onSelect={() => {
                          setSortBy('created_at');
                          setSortDirection('desc');
                          setSortPanelOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            sortBy === 'created_at'
                              ? 'opacity-100'
                              : 'opacity-0'
                          )}
                        />
                        Recently Created
                      </CommandItem>
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Filters */}
            <Popover open={filtersPanelOpen} onOpenChange={setFiltersPanelOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={hasActiveFilters ? 'default' : 'outline'}
                  size="sm"
                  className="h-6 gap-1 text-xs"
                >
                  <Filter className="h-3 w-3" />
                  Filter
                  {hasActiveFilters && (
                    <Badge
                      variant="secondary"
                      className="ml-1 h-4 px-1 text-xs"
                    >
                      {
                        [
                          filters.priorities.size > 0,
                          filters.assignees.size > 0,
                          filters.overdue,
                          filters.dueSoon,
                        ].filter(Boolean).length
                      }
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="max-h-96 w-72 overflow-y-auto p-3"
                align="start"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">Filters</h4>
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAllFilters}
                        className="h-auto p-1 text-xs"
                      >
                        Clear all
                      </Button>
                    )}
                  </div>

                  {/* Priority Filter */}
                  <div className="space-y-2">
                    <FilterLabel>Priority</FilterLabel>
                    <div className="flex flex-wrap gap-1">
                      {['critical', 'high', 'normal', 'low'].map((priority) => {
                        const isSelected = filters.priorities.has(
                          priority as TaskPriority
                        );
                        const taskCount = tasks.filter(
                          (task) => task.priority === priority
                        ).length;
                        return (
                          <Button
                            key={priority}
                            variant={isSelected ? 'default' : 'outline'}
                            size="sm"
                            className="h-6 text-xs"
                            onClick={() => {
                              const newPriorities = new Set(filters.priorities);
                              if (isSelected) {
                                newPriorities.delete(priority as TaskPriority);
                              } else {
                                newPriorities.add(priority as TaskPriority);
                              }
                              setFilters((prev) => ({
                                ...prev,
                                priorities: newPriorities,
                              }));
                            }}
                          >
                            <Flag
                              className={cn('mr-1 h-2 w-2', {
                                'text-dynamic-red/80': priority === 'critical',
                                'text-dynamic-orange/80': priority === 'high',
                                'text-dynamic-yellow/80': priority === 'normal',
                                'text-dynamic-green/80': priority === 'low',
                              })}
                            />
                            {priority === 'critical'
                              ? 'Urgent'
                              : priority === 'high'
                                ? 'High'
                                : priority === 'normal'
                                  ? 'Medium'
                                  : 'Low'}
                            ({taskCount})
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Assignees Filter */}
                  <div className="space-y-2">
                    <FilterLabel>Assignees</FilterLabel>
                    <Popover
                      open={assigneesOpen}
                      onOpenChange={setAssigneesOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 w-full justify-start text-xs"
                        >
                          <Users className="mr-2 h-3 w-3" />
                          {filters.assignees.size === 0
                            ? 'Select assignees...'
                            : `${filters.assignees.size} selected`}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="max-h-64 w-56 p-0"
                        align="start"
                      >
                        <Command>
                          <CommandInput placeholder="Search assignees..." />
                          <CommandList className="max-h-48 overflow-y-auto">
                            <CommandEmpty>No assignees found.</CommandEmpty>
                            <CommandGroup>
                              {/* All option */}
                              <CommandItem
                                onSelect={() => {
                                  // Selecting 'all' should clear all other selections
                                  setFilters((prev) => ({
                                    ...prev,
                                    assignees: new Set(['all']),
                                  }));
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    filters.assignees.has('all')
                                      ? 'opacity-100'
                                      : 'opacity-0'
                                  )}
                                />
                                <span>All tasks</span>
                              </CommandItem>

                              {/* Unassigned option */}
                              <CommandItem
                                onSelect={() => {
                                  // Selecting 'unassigned' should clear all other selections
                                  setFilters((prev) => ({
                                    ...prev,
                                    assignees: new Set(['unassigned']),
                                  }));
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    filters.assignees.has('unassigned')
                                      ? 'opacity-100'
                                      : 'opacity-0'
                                  )}
                                />
                                <span>Unassigned</span>
                              </CommandItem>

                              {members.length > 0 && (
                                <div className="my-1 border-border border-t" />
                              )}

                              {members.map((member: WorkspaceMember) => {
                                const isSelected = filters.assignees.has(
                                  member.id
                                );
                                return (
                                  <CommandItem
                                    key={member.id}
                                    onSelect={() => {
                                      // Selecting a specific assignee clears 'all' and 'unassigned', and toggles the assignee
                                      const newAssignees = new Set(
                                        filters.assignees
                                      );
                                      newAssignees.delete('all');
                                      newAssignees.delete('unassigned');
                                      if (isSelected) {
                                        newAssignees.delete(member.id);
                                      } else {
                                        newAssignees.add(member.id);
                                      }
                                      setFilters((prev) => ({
                                        ...prev,
                                        assignees: newAssignees,
                                      }));
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        'mr-2 h-4 w-4',
                                        isSelected ? 'opacity-100' : 'opacity-0'
                                      )}
                                    />
                                    <div className="flex items-center gap-2">
                                      {member.avatar_url && (
                                        <Image
                                          src={member.avatar_url}
                                          alt={
                                            member.display_name ||
                                            member.email ||
                                            'User avatar'
                                          }
                                          width={20}
                                          height={20}
                                          className="h-5 w-5 rounded-full"
                                        />
                                      )}
                                      <div className="text-sm">
                                        {member.display_name || member.email}
                                      </div>
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Quick Filters */}
                  <div className="space-y-2">
                    <FilterLabel>Quick Filters</FilterLabel>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant={filters.overdue ? 'default' : 'outline'}
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          setFilters((prev) => ({
                            ...prev,
                            overdue: !prev.overdue,
                          }));
                        }}
                      >
                        🔥 Overdue
                      </Button>
                      <Button
                        variant={filters.dueSoon ? 'default' : 'outline'}
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          setFilters((prev) => ({
                            ...prev,
                            dueSoon: !prev.dueSoon,
                          }));
                        }}
                      >
                        📅 Due Soon
                      </Button>
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="h-6 gap-1 text-xs"
              >
                <RefreshCw className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Virtualized Tasks Container */}
      <VirtualizedTaskList
        tasks={filteredAndSortedTasks}
        column={column}
        boardId={boardId}
        handleUpdate={handleUpdate}
        isMultiSelectMode={isMultiSelectMode}
        selectedTasks={selectedTasks}
        isPersonalWorkspace={isPersonalWorkspace}
        onTaskSelect={onTaskSelect}
        hasActiveFilters={hasActiveFilters}
        clearAllFilters={clearAllFilters}
      />

      <div className="rounded-b-xl border-t p-3 backdrop-blur-sm">
        <TaskForm listId={column.id} onTaskCreated={handleTaskCreated} />
      </div>
    </Card>
  );
});

export function BoardContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent relative flex h-full w-full gap-4 overflow-x-auto">
      {children}
    </div>
  );
}

// Lightweight list virtualization tuned for relatively uniform TaskCard heights.
// Assumptions:
//  - Average TaskCard height ~ 96px including margin gap (~84 card + 12 gap). We sample first few to refine.
//  - We only virtualize when task count exceeds VIRTUALIZE_THRESHOLD to avoid overhead for small lists.
//  - We keep overscan of 4 items above and below viewport to smooth fast scroll and during drag placeholder movement.
//  - Drag-and-drop library (dnd-kit) works since offscreen tasks simply aren't registered; this is acceptable for large columns
//    because user can only drag over visible tasks. Reordering across far distances relies on dropping into the column body,
//    which still updates list_id at column level.
interface VirtualizedTaskListProps {
  tasks: Task[];
  column: TaskList;
  boardId: string;
  handleUpdate: () => void;
  isMultiSelectMode?: boolean;
  selectedTasks?: Set<string>;
  isPersonalWorkspace?: boolean;
  onTaskSelect?: (taskId: string, event: React.MouseEvent) => void;
  hasActiveFilters: boolean;
  clearAllFilters: () => void;
}

const VIRTUALIZE_THRESHOLD = 60; // only virtualize for fairly large lists
const ESTIMATED_ITEM_HEIGHT = 96; // px including margin (space-y-2 gap)
const OVERSCAN_PX = 400; // overscan in pixels above and below viewport for smoother scroll

const VirtualizedTaskListComponent: React.FC<VirtualizedTaskListProps> = ({
  tasks,
  column,
  boardId,
  handleUpdate,
  isMultiSelectMode,
  selectedTasks,
  isPersonalWorkspace,
  onTaskSelect,
  hasActiveFilters,
  clearAllFilters,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [avgHeight, setAvgHeight] = useState(ESTIMATED_ITEM_HEIGHT);
  const sizesRef = useRef<Record<string, number>>({});
  const prefixHeightsRef = useRef<number[]>([]); // cumulative heights
  const idsRef = useRef<string[]>([]);

  const shouldVirtualize = tasks.length > VIRTUALIZE_THRESHOLD;
  const [isDraggingHere, setIsDraggingHere] = useState(false);

  // Monitor drag state to widen window while a task from this column is dragged
  useDndMonitor({
    onDragStart(event) {
      const t = event.active.data?.current?.task as Task | undefined;
      if (t && t.list_id === column.id) setIsDraggingHere(true);
    },
    onDragEnd() {
      setIsDraggingHere(false);
    },
    onDragCancel() {
      setIsDraggingHere(false);
    },
  });

  // Measure viewport height
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Scroll handler (rAF throttled)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !shouldVirtualize) return;
    let frame: number | null = null;
    const onScroll = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setScrollTop(el.scrollTop);
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [shouldVirtualize]);

  // Recompute average height when sizes change
  const rebuildPrefixHeights = useCallback(() => {
    const ids = idsRef.current;
    let running = 0;
    const prefix: number[] = new Array(ids.length);
    for (let i = 0; i < ids.length; i++) {
      const key = ids[i];
      const h = key ? (sizesRef.current[key] ?? avgHeight) : avgHeight;
      prefix[i] = running;
      running += h;
    }
    prefixHeightsRef.current = prefix;
  }, [avgHeight]);

  const updateSize = useCallback(
    (id: string, height: number) => {
      const prev = sizesRef.current[id];
      if (prev === height) return;
      sizesRef.current[id] = height;
      const values = Object.values(sizesRef.current);
      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        setAvgHeight(Math.round(sum / values.length));
      }
      rebuildPrefixHeights();
    },
    [rebuildPrefixHeights]
  );

  // Initialize idsRef when task list changes
  useEffect(() => {
    idsRef.current = tasks.map((t) => t.id);
    rebuildPrefixHeights();
  }, [tasks, rebuildPrefixHeights]);

  let totalHeight: number | undefined;
  let startIndex = 0;
  let endIndex = tasks.length;
  let offsetY = 0;
  let visibleTasks = tasks;

  if (shouldVirtualize) {
    const ids = idsRef.current;
    const prefix = prefixHeightsRef.current;
    const getOffset = (index: number) => prefix[index] ?? index * avgHeight;
    const getHeight = (index: number) => {
      const key = ids[index];
      return key ? (sizesRef.current[key] ?? avgHeight) : avgHeight;
    };

    // Binary search for first index whose bottom >= scrollTop - overscan
    const overscan = isDraggingHere ? OVERSCAN_PX * 2 : OVERSCAN_PX;
    const targetTop = Math.max(0, scrollTop - overscan);
    let lo = 0;
    let hi = tasks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const midBottom = getOffset(mid) + getHeight(mid);
      if (midBottom >= targetTop) hi = mid;
      else lo = mid + 1;
    }
    startIndex = lo;

    // Binary search for last index whose top <= scrollBottom + overscan
    const targetBottom = scrollTop + viewportHeight + overscan;
    lo = startIndex;
    hi = tasks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      const midTop = getOffset(mid);
      if (midTop <= targetBottom) lo = mid;
      else hi = mid - 1;
    }
    endIndex = Math.min(tasks.length, lo + 1);
    visibleTasks = tasks.slice(startIndex, endIndex);
    offsetY = getOffset(startIndex);
    const lastIndex = tasks.length - 1;
    const lastBottom = getOffset(lastIndex) + getHeight(lastIndex);
    totalHeight = lastBottom;
  }

  return (
    <div
      ref={scrollRef}
      className="h-full flex-1 space-y-2 overflow-y-auto p-3"
      // When not virtualizing we still want consistent styling
      data-virtualized={shouldVirtualize ? 'true' : 'false'}
    >
      {tasks.length === 0 ? (
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-sm">
              {hasActiveFilters ? 'No tasks match filters' : 'No tasks yet'}
            </p>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="mt-2 h-auto text-xs"
              >
                Clear filters to see all tasks
              </Button>
            )}
          </div>
        </div>
      ) : shouldVirtualize ? (
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div
            className="grid gap-2"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${offsetY}px)`,
            }}
          >
            {visibleTasks.map((task) => (
              <MeasuredTaskCard
                key={task.id}
                task={task}
                taskList={column}
                boardId={boardId}
                onUpdate={handleUpdate}
                isSelected={Boolean(
                  isMultiSelectMode && selectedTasks?.has(task.id)
                )}
                isMultiSelectMode={isMultiSelectMode}
                isPersonalWorkspace={isPersonalWorkspace}
                onSelect={onTaskSelect}
                onHeight={(h) => updateSize(task.id, h)}
              />
            ))}
          </div>
        </div>
      ) : (
        tasks.map((task) => (
          <MeasuredTaskCard
            key={task.id}
            task={task}
            taskList={column}
            boardId={boardId}
            onUpdate={handleUpdate}
            isSelected={Boolean(
              isMultiSelectMode && selectedTasks?.has(task.id)
            )}
            isMultiSelectMode={isMultiSelectMode}
            isPersonalWorkspace={isPersonalWorkspace}
            onSelect={onTaskSelect}
            onHeight={(h) => updateSize(task.id, h)}
          />
        ))
      )}
    </div>
  );
};

const VirtualizedTaskList = React.memo(
  VirtualizedTaskListComponent,
  (prev, next) => {
    // Shallow compare arrays by length + first/last id for quick bailout
    if (prev.tasks.length !== next.tasks.length) return false;
    if (prev.tasks[0]?.id !== next.tasks[0]?.id) return false;
    if (
      prev.tasks[prev.tasks.length - 1]?.id !==
      next.tasks[next.tasks.length - 1]?.id
    )
      return false;
    // Compare selection size
    if (prev.selectedTasks?.size !== next.selectedTasks?.size) return false;
    // Compare basic flags
    if (prev.isMultiSelectMode !== next.isMultiSelectMode) return false;
    if (prev.hasActiveFilters !== next.hasActiveFilters) return false;
    return true;
  }
);

interface MeasuredTaskCardProps {
  task: Task;
  taskList: TaskList;
  boardId: string;
  onUpdate: () => void;
  isSelected: boolean;
  isMultiSelectMode?: boolean;
  isPersonalWorkspace?: boolean;
  onSelect?: (taskId: string, event: React.MouseEvent) => void;
  onHeight: (height: number) => void;
}

const MeasuredTaskCard: React.FC<MeasuredTaskCardProps> = ({
  task,
  taskList,
  boardId,
  onUpdate,
  isSelected,
  isMultiSelectMode,
  isPersonalWorkspace,
  onSelect,
  onHeight,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const node = ref.current;
    // Initial measure
    onHeight(node.getBoundingClientRect().height + 8 /* approximate gap */);
    // Resize observer for dynamic height changes (e.g., label changes)
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === node) {
          onHeight(entry.contentRect.height + 8);
        }
      }
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, [onHeight]);

  return (
    <div ref={ref} data-id={task.id}>
      <TaskCard
        task={task}
        taskList={taskList}
        boardId={boardId}
        onUpdate={onUpdate}
        isSelected={isSelected}
        isMultiSelectMode={isMultiSelectMode}
        isPersonalWorkspace={isPersonalWorkspace}
        onSelect={onSelect}
      />
    </div>
  );
};
