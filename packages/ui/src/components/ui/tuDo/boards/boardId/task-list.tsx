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
import { ListActions } from '@tuturuuu/ui/tuDo/boards/boardId/list-actions';
import { TaskCard } from '@tuturuuu/ui/tuDo/boards/boardId/task';
import { TaskForm } from '@tuturuuu/ui/tuDo/boards/boardId/task-form';
import { TaskTagInput } from '@tuturuuu/ui/tuDo/shared/task-tag-input';
import { DEV_MODE } from '@tuturuuu/utils/common/common';
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
import { toast } from 'sonner';
import { statusIcons } from './status-section';

interface Props {
  column: TaskList;
  boardId: string;
  tasks: Task[];
  isOverlay?: boolean;
  onTaskCreated?: () => void;
  onListUpdated?: () => void;
  selectedTasks?: Set<string>;
  isMultiSelectMode?: boolean;
  onTaskSelect?: (taskId: string, event: React.MouseEvent) => void;
  isScrollbarActive?: boolean;
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
  tags: Set<string>;
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
    tags: new Set(),
    overdue: false,
    dueSoon: false,
  });
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);
  const [sortPanelOpen, setSortPanelOpen] = useState(false);
  const [assigneesOpen, setAssigneesOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [isCompactMode, setIsCompactMode] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Check if content overflows
  const checkOverflow = useCallback(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const hasOverflow = container.scrollHeight > container.clientHeight;
      const shouldBeCompact = hasOverflow && isScrolling;

      // Only enable compact mode if there's overflow AND user is scrolling
      setIsCompactMode(shouldBeCompact);
    }
  }, [isScrolling]);

  // Monitor window resize for overflow changes
  useEffect(() => {
    const handleResize = () => checkOverflow();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [checkOverflow]);

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

  // Cleanup scrollbar timeout on unmount

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

      // Tags filter
      if (filters.tags.size > 0) {
        if (!task.tags || task.tags.length === 0) return false;
        const hasMatchingTag = task.tags.some((tag) => filters.tags.has(tag));
        if (!hasMatchingTag) return false;
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
        // If both have priority, sort by priority (1 comes first)
        if (a.priority != null && b.priority != null) {
          const priorityDiff = priorityCompare(a.priority, b.priority);
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

  // Monitor content changes and check for overflow
  // Note: filteredAndSortedTasks.length is needed to trigger overflow check when tasks change
  useEffect(() => {
    // Only check overflow when tasks change, not when isScrolling changes
    if (filteredAndSortedTasks.length > 0) {
      checkOverflow();
    }
  }, [filteredAndSortedTasks.length, checkOverflow]);

  // Detect scrollbar dragging vs wheel scrolling
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let isDraggingScrollbar = false;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if clicking on scrollbar elements - be more specific but not too restrictive
      const isScrollbarClick =
        target.classList.contains('scrollbar-thumb') ||
        target.classList.contains('scrollbar-track') ||
        target.closest('.scrollbar-thumb') ||
        target.closest('.scrollbar-track') ||
        // Also check for common scrollbar selectors
        target.matches('[data-radix-scroll-area-viewport]') ||
        target.closest('[data-radix-scroll-area-viewport]') ||
        // Check if clicking on the right edge of the container (where scrollbar usually is)
        (target === container && e.offsetX > container.clientWidth - 20);

      if (isScrollbarClick) {
        isDraggingScrollbar = true;
        setIsScrolling(true);

        // Only show activation toast if compact mode wasn't already active
        if (!isCompactMode) {
          // Dismiss any existing deactivation toast first
          toast.dismiss('compact-deactivated');

          toast.success('Compact mode activated', {
            id: 'compact-activated',
            description:
              'Task cards are now in compact view for better scrolling',
            duration: 4000,
          });
        }
      }
    };

    const handleMouseMove = () => {
      if (isDraggingScrollbar) {
        // User is actively dragging scrollbar
        setIsScrolling(true);
      }
    };

    const handleMouseUp = () => {
      if (isDraggingScrollbar) {
        isDraggingScrollbar = false;
        // Turn off compact mode immediately when scrollbar is released
        setIsScrolling(false);

        // Only show deactivation toast if compact mode was actually active
        if (isCompactMode) {
          // Dismiss any existing activation toast first
          toast.dismiss('compact-activated');

          toast.info('Compact mode deactivated', {
            id: 'compact-deactivated',
            description: 'Task cards returned to normal view',
            duration: 1500,
          });
        }
      }
    };

    // Deactivate compact mode when clicking outside the scrollbar area
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if there's actually a visible scrollbar
      const hasVisibleScrollbar =
        container && container.scrollHeight > container.clientHeight;

      if (hasVisibleScrollbar) {
        // When scrollbar is visible, only deactivate when clicking outside scrollbar area
        const isScrollbarClick =
          target.classList.contains('scrollbar-thumb') ||
          target.classList.contains('scrollbar-track') ||
          target.closest('.scrollbar-thumb') ||
          target.closest('.scrollbar-track') ||
          // Also check for common scrollbar selectors
          target.matches('[data-radix-scroll-area-viewport]') ||
          target.closest('[data-radix-scroll-area-viewport]') ||
          // Check if clicking on the right edge of the container (where scrollbar usually is)
          (target === container && e.offsetX > container.clientWidth - 20);

        // If clicking outside scrollbar and compact mode is active, deactivate it
        if (!isScrollbarClick && isScrolling && isCompactMode) {
          setIsScrolling(false);

          toast.info('Compact mode deactivated', {
            description: 'Task cards returned to normal view',
            duration: 2000,
          });
        }
      } else {
        // When no scrollbar is visible, clicking anywhere deactivates compact mode
        if (isScrolling && isCompactMode) {
          setIsScrolling(false);

          toast.info('Compact mode deactivated', {
            id: 'compact-deactivated',
            description: 'Task cards returned to normal view',
            duration: 1500,
          });
        }
      }
    };

    container.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCompactMode, isScrolling]);

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilters({
      search: '',
      priorities: new Set(),
      assignees: new Set(),
      tags: new Set(),
      overdue: false,
      dueSoon: false,
    });
    setSortBy('none');
  };

  const hasActiveFilters =
    filters.search ||
    filters.priorities.size > 0 ||
    filters.assignees.size > 0 ||
    filters.tags.size > 0 ||
    filters.overdue ||
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
        'touch-none select-none border-l-4',
        colorClass,
        isDragging &&
          'rotate-1 scale-[1.02] opacity-90 shadow-xl ring-2 ring-primary/20',
        isOverlay && 'shadow-2xl ring-2 ring-primary/30',
        'hover:shadow-md',
        // Visual feedback for invalid drop (dev only)
        DEV_MODE && isDragging && !isOverlay && 'ring-2 ring-red-400/60'
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

                  {/* Tags Filter */}
                  <div className="space-y-2">
                    <FilterLabel>Tags</FilterLabel>
                    <TaskTagInput
                      value={Array.from(filters.tags)}
                      onChange={(tags) => {
                        setFilters((prev) => ({
                          ...prev,
                          tags: new Set(tags),
                        }));
                      }}
                      boardId={boardId}
                      placeholder="Filter by tags..."
                      maxTags={5}
                    />
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

      <div
        ref={scrollContainerRef}
        className="max-h-[24rem] flex-1 space-y-1.5 overflow-y-auto p-3 pb-6"
      >
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
              isSelected={isMultiSelectMode && selectedTasks?.has(task.id)}
              isMultiSelectMode={isMultiSelectMode}
              onSelect={onTaskSelect}
              isMinimalMode={isCompactMode}
            />
          ))
        )}
      </div>

      <div className="border-t p-3 backdrop-blur-sm">
        <TaskForm listId={column.id} onTaskCreated={handleTaskCreated} />
      </div>
    </Card>
  );
});

export function BoardContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground/50 relative flex h-full min-h-0 w-full flex-nowrap overflow-x-auto pb-4">
      {children}
    </div>
  );
}
