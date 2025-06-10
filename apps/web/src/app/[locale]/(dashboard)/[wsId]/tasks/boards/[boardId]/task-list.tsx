import { ListActions } from './list-actions';
import { statusIcons } from './status-section';
import { Task, TaskCard } from './task';
import { TaskForm } from './task-form';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { TaskList } from '@tuturuuu/types/primitives/TaskBoard';
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
import { cn } from '@tuturuuu/utils/format';
import { debounce } from 'lodash';
import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface Column extends TaskList {
  // This extends TaskList to include color, status, position
}

interface Props {
  column: Column;
  boardId: string;
  tasks: Task[];
  isOverlay?: boolean;
  onTaskCreated?: () => void;
  onListUpdated?: () => void;
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

interface TaskListFilters {
  search: string;
  priorities: Set<number>;
  assignees: Set<string>;
  overdue: boolean;
  unassigned: boolean;
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

export function BoardColumn({
  column,
  boardId,
  tasks,
  isOverlay,
  onTaskCreated,
  onListUpdated,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('none');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filters, setFilters] = useState<TaskListFilters>({
    search: '',
    priorities: new Set(),
    assignees: new Set(),
    overdue: false,
    unassigned: false,
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

  // Get all unique assignees from tasks in this column
  const allAssignees = useMemo(() => {
    const assigneeMap = new Map();
    tasks.forEach((task) => {
      task.assignees?.forEach((assignee) => {
        assigneeMap.set(assignee.id, assignee);
      });
    });
    return Array.from(assigneeMap.values());
  }, [tasks]);

  // Filter and sort tasks for this column
  const filteredAndSortedTasks = useMemo(() => {
    let filtered = tasks.filter((task) => {
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
        const hasMatchingAssignee = task.assignees?.some((assignee) =>
          filters.assignees.has(assignee.id)
        );
        if (!hasMatchingAssignee) return false;
      }

      // Overdue filter
      if (filters.overdue) {
        if (!task.end_date || new Date(task.end_date) >= new Date()) {
          return false;
        }
      }

      // Unassigned filter
      if (filters.unassigned) {
        if (task.assignees && task.assignees.length > 0) {
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
            const aPriority = a.priority ?? 999;
            const bPriority = b.priority ?? 999;
            comparison = aPriority - bPriority;
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
            const aPriority = a.priority ?? 999;
            const bPriority = b.priority ?? 999;
            comparison = bPriority - aPriority;
            break;
          }
        }

        return sortDirection === 'desc' ? -comparison : comparison;
      });
    } else {
      // Default sorting when no sort is selected
      filtered.sort((a, b) => {
        // If both have priority, sort by priority (1 comes first)
        if (a.priority != null && b.priority != null) {
          const priorityDiff = a.priority - b.priority;
          // If priorities are the same, sort by due date
          if (priorityDiff === 0) {
            // Tasks with due dates come before tasks without due dates
            if (a.end_date && b.end_date) {
              return (
                new Date(a.end_date).getTime() - new Date(b.end_date).getTime()
              );
            }
            if (a.end_date && !b.end_date) return -1;
            if (!a.end_date && b.end_date) return 1;
            return 0;
          }
          return priorityDiff;
        }
        // Tasks with priority come before tasks without priority
        if (a.priority != null && b.priority == null) return -1;
        if (a.priority == null && b.priority != null) return 1;
        // If both have no priority, sort by due date
        if (a.end_date && b.end_date) {
          return (
            new Date(a.end_date).getTime() - new Date(b.end_date).getTime()
          );
        }
        if (a.end_date && !b.end_date) return -1;
        if (!a.end_date && b.end_date) return 1;
        // If both have no priority and no due date, maintain original order
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
      unassigned: false,
      dueSoon: false,
    });
    setSortBy('none');
  };

  const hasActiveFilters =
    filters.search ||
    filters.priorities.size > 0 ||
    filters.assignees.size > 0 ||
    filters.overdue ||
    filters.unassigned ||
    filters.dueSoon ||
    sortBy !== 'none';

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

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex h-full w-[350px] flex-col rounded-xl transition-all duration-200',
        'touch-none border-l-4 select-none',
        colorClass,
        isDragging &&
          'scale-[1.02] rotate-1 opacity-90 shadow-xl ring-2 ring-primary/20',
        isOverlay && 'shadow-2xl ring-2 ring-primary/30',
        'hover:shadow-md'
      )}
    >
      <div className="flex items-center gap-2 rounded-t-xl border-b p-3">
        <div
          {...attributes}
          {...listeners}
          className={cn(
            '-ml-2 h-auto cursor-grab p-1 opacity-40 transition-all',
            'group-hover:opacity-70 hover:bg-black/5',
            isDragging && 'opacity-100',
            isOverlay && 'cursor-grabbing'
          )}
        >
          <span className="sr-only">Move list</span>
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="flex flex-1 items-center gap-2">
          <span className="text-sm">{statusIcon}</span>
          <h3 className="text-sm font-semibold text-foreground/90">
            {column.name}
          </h3>
          <Badge
            variant="secondary"
            className={cn(
              'px-2 py-0.5 text-xs font-medium',
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
                          filters.unassigned,
                          filters.dueSoon,
                        ].filter(Boolean).length
                      }
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-3" align="start">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Filters</h4>
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
                    <label className="text-xs font-medium">Priority</label>
                    <div className="flex flex-wrap gap-1">
                      {[1, 2, 3, 4].map((priority) => {
                        const isSelected = filters.priorities.has(priority);
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
                                newPriorities.delete(priority);
                              } else {
                                newPriorities.add(priority);
                              }
                              setFilters((prev) => ({
                                ...prev,
                                priorities: newPriorities,
                              }));
                            }}
                          >
                            <Flag
                              className={cn('mr-1 h-2 w-2', {
                                'text-dynamic-red/80': priority === 1,
                                'text-dynamic-orange/80': priority === 2,
                                'text-dynamic-yellow/80': priority === 3,
                                'text-dynamic-green/80': priority === 4,
                              })}
                            />
                            {priority === 1
                              ? 'Urgent'
                              : priority === 2
                                ? 'High'
                                : priority === 3
                                  ? 'Medium'
                                  : 'Low'}{' '}
                            ({taskCount})
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Assignees Filter */}
                  {allAssignees.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium">Assignees</label>
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
                        <PopoverContent className="w-56 p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search assignees..." />
                            <CommandList>
                              <CommandEmpty>No assignees found.</CommandEmpty>
                              <CommandGroup>
                                {allAssignees.map((assignee) => {
                                  const isSelected = filters.assignees.has(
                                    assignee.id
                                  );
                                  return (
                                    <CommandItem
                                      key={assignee.id}
                                      onSelect={() => {
                                        const newAssignees = new Set(
                                          filters.assignees
                                        );
                                        if (isSelected) {
                                          newAssignees.delete(assignee.id);
                                        } else {
                                          newAssignees.add(assignee.id);
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
                                          isSelected
                                            ? 'opacity-100'
                                            : 'opacity-0'
                                        )}
                                      />
                                      <div className="flex items-center gap-2">
                                        {assignee.avatar_url && (
                                          <Image
                                            src={assignee.avatar_url}
                                            alt={
                                              assignee.display_name ||
                                              assignee.email
                                            }
                                            width={20}
                                            height={20}
                                            className="h-5 w-5 rounded-full"
                                          />
                                        )}
                                        <div className="text-sm">
                                          {assignee.display_name ||
                                            assignee.email}
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
                  )}

                  {/* Quick Filters */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium">Quick Filters</label>
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
                      <Button
                        variant={filters.unassigned ? 'default' : 'outline'}
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => {
                          setFilters((prev) => ({
                            ...prev,
                            unassigned: !prev.unassigned,
                          }));
                        }}
                      >
                        👤 Unassigned (
                        {
                          tasks.filter(
                            (task) =>
                              !task.assignees || task.assignees.length === 0
                          ).length
                        }
                        )
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

      <div className="max-h-[32rem] flex-1 space-y-2 overflow-y-auto p-3">
        {filteredAndSortedTasks.length === 0 ? (
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
        ) : (
          filteredAndSortedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              taskList={column}
              boardId={boardId}
              onUpdate={handleUpdate}
            />
          ))
        )}
      </div>

      <div className="border-t p-3 backdrop-blur-sm">
        <TaskForm listId={column.id} onTaskCreated={handleTaskCreated} />
      </div>
    </Card>
  );
}

export function BoardContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative scrollbar-none flex h-full w-full gap-4 overflow-x-auto pb-6">
      {children}
    </div>
  );
}
