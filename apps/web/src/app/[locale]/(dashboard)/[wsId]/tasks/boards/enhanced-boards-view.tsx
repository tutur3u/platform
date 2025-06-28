'use client';

import type {
  Task,
  TaskBoard,
  TaskList,
} from '@tuturuuu/types/primitives/TaskBoard';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  // Users,
  Eye,
  Filter,
  LayoutGrid,
  LayoutList,
  RefreshCw,
  Settings2,
  SortAsc,
  Target,
  TrendingUp,
  X,
  Zap,
} from '@tuturuuu/ui/icons';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useMemo, useState } from 'react';
import { CustomDataTable } from '@/components/custom-data-table';
import { projectColumns } from './columns';
// Import new components
import { GanttChart } from './components/GanttChart';
import { StatusDistribution } from './components/StatusDistribution';
import { TaskCreationAnalytics } from './components/TaskCreationAnalytics';
import { TaskGroup } from './components/TaskGroup';
import { TaskWorkflowAnalytics } from './components/TaskWorkflowAnalytics';
// Import analytics hooks
import {
  useAvgDuration,
  useOnTimeRate,
  useTaskVelocity,
} from './hooks/useTaskAnalytics';
// Import helper functions
import { getFilteredMetrics } from './utils/taskHelpers';

interface AnalyticsFilters {
  timeView: 'week' | 'month' | 'year';
  selectedBoard: string | null;
  statusFilter: 'all' | 'not_started' | 'active' | 'done' | 'closed';
}

const CARD_LAYOUT_OPTIONS = [
  { label: 'Grid (1 column)', value: 'grid-cols-1' },
  { label: 'Grid (2 columns)', value: 'grid-cols-2' },
  { label: 'Grid (3 columns)', value: 'grid-cols-3' },
] as const;

type CardLayout = (typeof CARD_LAYOUT_OPTIONS)[number]['value'];

interface EnhancedBoardsViewProps {
  data: (TaskBoard & {
    href: string;
    totalTasks: number;
    completedTasks: number;
    activeTasks: number;
    overdueTasks: number;
    progressPercentage: number;
    highPriorityTasks: number;
    mediumPriorityTasks: number;
    lowPriorityTasks: number;
    task_lists?: (TaskList & { tasks: Task[] })[];
  })[];
  count: number;
}

// Define types for better type safety
type TaskStatus = 'not_started' | 'active' | 'done' | 'closed';
type FilterType = 'all' | 'completed' | 'overdue' | 'urgent';

interface TaskModalState {
  isOpen: boolean;
  filterType: FilterType;
  selectedBoard: string | null; // null means all boards
}

export function EnhancedBoardsView({ data, count }: EnhancedBoardsViewProps) {
  // Ensure data is always an array to prevent hook order issues
  const safeData = data || [];

  // Removed unused activeTab state - tabs are controlled by Tabs component
  const [cardLayout, setCardLayout] = useState<CardLayout>('grid-cols-3');
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showColumnSettings, setShowColumnSettings] = useState(false);

  // Column visibility state
  const [columnVisibility, setColumnVisibility] = useState({
    boardName: true,
    totalTasks: true,
    progress: true,
    completedTasks: true,
    activeTasks: true,
    overdueTasks: true,
    createdDate: false,
    lastUpdated: false,
    priorityDistribution: true,
  });

  // Reset column visibility to default
  const resetColumnVisibility = () => {
    setColumnVisibility({
      boardName: true,
      totalTasks: true,
      progress: true,
      completedTasks: true,
      activeTasks: true,
      overdueTasks: true,
      createdDate: false,
      lastUpdated: false,
      priorityDistribution: true,
    });
  };
  const [taskModal, setTaskModal] = useState<TaskModalState>({
    isOpen: false,
    filterType: 'all',
    selectedBoard: null,
  });

  const handleLayoutChange = () => {
    const currentIndex = CARD_LAYOUT_OPTIONS.findIndex(
      (opt) => opt.value === cardLayout
    );
    const nextIndex = (currentIndex + 1) % CARD_LAYOUT_OPTIONS.length;
    const nextOption = CARD_LAYOUT_OPTIONS[nextIndex];
    if (nextOption) {
      setCardLayout(nextOption.value);
    }
  };

  const [analyticsFilters, setAnalyticsFilters] = useState<AnalyticsFilters>({
    timeView: 'week',
    selectedBoard: null,
    statusFilter: 'all',
  });

  // [sidebar and modal states remain the same]
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Memoize the selected board data to avoid repeated find operations
  const selectedBoardData = useMemo(() => {
    return selectedBoard ? safeData.find((b) => b.id === selectedBoard) : null;
  }, [safeData, selectedBoard]);

  // Calculate aggregate metrics for the quick stats - now responsive to board selection
  const {
    totalTasks,
    totalCompleted,
    totalOverdue,
    totalHighPriority,
    avgProgress,
  } = useMemo(() => getFilteredMetrics(safeData, null), [safeData]);

  // Analytics-specific metrics that respond to board selection
  const analyticsMetrics = useMemo(
    () => getFilteredMetrics(safeData, analyticsFilters.selectedBoard),
    [analyticsFilters.selectedBoard, safeData]
  );

  // Get all tasks across all boards for filtering
  const allTasks = useMemo(() => {
    return safeData.flatMap((board) =>
      (board.task_lists || []).flatMap((list) =>
        (list.tasks || []).map((task) => ({
          ...task,
          boardId: board.id,
          boardName: board.name,
          listId: list.id,
          listName: list.name,
          listStatus: list.status,
          boardHref: board.href,
        }))
      )
    );
  }, [safeData]);

  // Use analytics hooks instead of duplicate calculations
  const calculateAvgDuration = useAvgDuration(
    allTasks,
    analyticsFilters.selectedBoard
  );
  const calculateTaskVelocity = useTaskVelocity(
    allTasks,
    analyticsFilters.selectedBoard
  );
  const calculateOnTimeRate = useOnTimeRate(
    allTasks,
    analyticsFilters.selectedBoard
  );

  // Filter tasks based on modal state
  const filteredTasks = useMemo(() => {
    let tasks = allTasks;

    // Filter by board if specified
    if (taskModal.selectedBoard && taskModal.selectedBoard !== 'all') {
      tasks = tasks.filter((task) => task.boardId === taskModal.selectedBoard);
    }

    // Filter by type
    switch (taskModal.filterType) {
      case 'completed':
        return tasks.filter(
          (task) =>
            task.archived ||
            task.listStatus === 'done' ||
            task.listStatus === 'closed'
        );
      case 'overdue':
        return tasks.filter(
          (task) =>
            !task.archived &&
            task.listStatus !== 'done' &&
            task.listStatus !== 'closed' &&
            task.end_date &&
            new Date(task.end_date) < new Date()
        );
      case 'urgent':
        return tasks.filter(
          (task) =>
            task.priority === 1 &&
            !task.archived &&
            task.listStatus !== 'done' &&
            task.listStatus !== 'closed'
        );
      default:
        return tasks;
    }
  }, [allTasks, taskModal]);

  // Group filtered tasks by status
  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, typeof filteredTasks> = {
      not_started: [],
      active: [],
      done: [],
      closed: [],
    };

    filteredTasks.forEach((task) => {
      if (task.archived || task.listStatus === 'done') {
        groups.done.push(task);
      } else if (task.listStatus === 'closed') {
        groups.closed.push(task);
      } else if (task.listStatus === 'active') {
        groups.active.push(task);
      } else {
        groups.not_started.push(task);
      }
    });

    return groups;
  }, [filteredTasks]);

  const handleBoardClick = (
    board: (typeof safeData)[0],
    e: React.MouseEvent
  ) => {
    e.preventDefault();
    setSelectedBoard(board.id);
    setSidebarOpen(true);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
    setSelectedBoard(null);
  };

  const openTaskModal = (filterType: FilterType, boardId?: string) => {
    setTaskModal({
      isOpen: true,
      filterType,
      selectedBoard: boardId || null,
    });
  };

  const closeTaskModal = () => {
    setTaskModal({
      isOpen: false,
      filterType: 'all',
      selectedBoard: null,
    });
  };

  const handleTaskClick = (task: (typeof filteredTasks)[0]) => {
    // Navigate to the task's board page
    window.location.href = `${task.boardHref}?taskId=${task.id}`;
  };

  const refreshTasks = () => {
    // Refresh the page to reload data
    window.location.reload();
  };

  // Table functionality handlers
  const handleTableFilter = () => {
    setShowAdvancedFilters(!showAdvancedFilters);
  };

  const handleTableSort = () => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  const handleTableSettings = () => {
    setShowColumnSettings(!showColumnSettings);
  };

  // Apply filters to data and check if filters are active
  const { filteredData, hasActiveFilters } = useMemo(() => {
    const hasFilters =
      showAdvancedFilters ||
      searchQuery.trim() !== '' ||
      taskModal.filterType !== 'all';
    let filtered = [...safeData];

    // Search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter((board) =>
        board.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter - fix FilterType comparison
    if (taskModal.filterType !== 'all') {
      // For now, we don't filter boards based on FilterType since FilterType
      // is meant for tasks ('completed' | 'overdue' | 'urgent'), not board status
      // This logic can be enhanced when board-level filtering is needed
    }

    // Sort
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'created_at':
          aValue = new Date(a.created_at || 0).getTime();
          bValue = new Date(b.created_at || 0).getTime();
          break;
        case 'totalTasks':
          aValue = a.totalTasks;
          bValue = b.totalTasks;
          break;
        case 'progressPercentage':
          aValue = a.progressPercentage;
          bValue = b.progressPercentage;
          break;
        default:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }

      if (sortOrder === 'desc') {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      } else {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      }
    });

    return { filteredData: filtered, hasActiveFilters: hasFilters };
  }, [
    safeData,
    showAdvancedFilters,
    searchQuery,
    sortBy,
    sortOrder,
    taskModal,
  ]);

  return (
    <>
      {/* Enhanced Quick Stats - Now Clickable */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div
          className="cursor-pointer rounded-xl border bg-gradient-to-br from-blue-50 to-blue-100/50 p-4 transition-all hover:scale-105 hover:shadow-md dark:from-blue-950/20 dark:to-blue-900/10"
          onClick={() => openTaskModal('all')}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                Total Tasks
              </p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {totalTasks}
              </p>
            </div>
          </div>
        </div>

        <div
          className="cursor-pointer rounded-xl border bg-gradient-to-br from-green-50 to-green-100/50 p-4 transition-all hover:scale-105 hover:shadow-md dark:from-green-950/20 dark:to-green-900/10"
          onClick={() => openTaskModal('completed')}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-300">
                Completed
              </p>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                {totalCompleted}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-gradient-to-br from-purple-50 to-purple-100/50 p-4 transition-all hover:shadow-md dark:from-purple-950/20 dark:to-purple-900/10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/10 p-2">
              <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
                Analytics
              </p>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                {avgProgress}%
              </p>
            </div>
          </div>
        </div>

        <div
          className="cursor-pointer rounded-xl border bg-gradient-to-br from-red-50 to-red-100/50 p-4 transition-all hover:scale-105 hover:shadow-md dark:from-red-950/20 dark:to-red-900/10"
          onClick={() => openTaskModal('overdue')}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-500/10 p-2">
              <Clock className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                Overdue
              </p>
              <p className="text-2xl font-bold text-red-900 dark:text-red-100">
                {totalOverdue}
              </p>
            </div>
          </div>
        </div>

        <div
          className="cursor-pointer rounded-xl border bg-gradient-to-br from-orange-50 to-orange-100/50 p-4 transition-all hover:scale-105 hover:shadow-md dark:from-orange-950/20 dark:to-orange-900/10"
          onClick={() => openTaskModal('urgent')}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-500/10 p-2">
              <Zap className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-orange-700 dark:text-orange-300">
                Urgent Priority
              </p>
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                {totalHighPriority}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content with Tabs */}
      <div className="space-y-6">
        <Tabs defaultValue="table" className="w-full">
          {/* Unified Toolbar */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-1">
            <div className="flex items-center gap-1">
              {/* View Switcher */}
              <TabsList className="grid grid-cols-3 bg-background shadow-sm">
                <TabsTrigger
                  value="table"
                  className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <LayoutList className="h-4 w-4" />
                  <span className="hidden sm:inline">Table</span>
                </TabsTrigger>
                <TabsTrigger
                  value="cards"
                  className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <LayoutGrid className="h-4 w-4" />
                  <span className="hidden sm:inline">Cards</span>
                </TabsTrigger>
                <TabsTrigger
                  value="analytics"
                  className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Analytics</span>
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Contextual Actions */}
            <div className="flex items-center gap-1">
              {/* Table View Actions */}
              <TabsContent
                value="table"
                className="m-0 data-[state=inactive]:hidden"
              >
                <div className="flex items-center gap-1">
                  <Button
                    variant={showAdvancedFilters ? 'default' : 'ghost'}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={handleTableFilter}
                    title="Toggle filters"
                  >
                    <Filter className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={handleTableSort}
                    title={`Sort ${showAdvancedFilters ? 'descending' : 'ascending'}`}
                  >
                    <SortAsc
                      className={cn(
                        'h-4 w-4',
                        showAdvancedFilters && 'rotate-180'
                      )}
                    />
                  </Button>
                  <Button
                    variant={showColumnSettings ? 'default' : 'ghost'}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={handleTableSettings}
                    title="Table settings"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              {/* Cards View Actions */}
              <TabsContent
                value="cards"
                className="m-0 data-[state=inactive]:hidden"
              >
                <div className="flex items-center gap-1">
                  <Button
                    variant={showAdvancedFilters ? 'default' : 'ghost'}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={handleTableFilter}
                    title="Filter cards"
                  >
                    <Filter className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={handleTableSort}
                    title="Sort cards"
                  >
                    <SortAsc
                      className={cn(
                        'h-4 w-4',
                        showAdvancedFilters && 'rotate-180'
                      )}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={handleLayoutChange}
                    title={`Current: ${cardLayout.split('-')[2]} columns. Click to switch layout.`}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              {/* Analytics View Actions */}
              <TabsContent
                value="analytics"
                className="m-0 data-[state=inactive]:hidden"
              >
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    Analytics view
                  </span>
                </div>
              </TabsContent>

              {/* Global Actions */}
              <div className="mx-1 h-4 w-px bg-border" />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={refreshTasks}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Filter Panel */}
          {showAdvancedFilters && (
            <div className="mt-4 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-sm font-medium">Search</label>
                  <input
                    type="text"
                    placeholder="Search boards..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="w-40">
                  <label className="text-sm font-medium">Status</label>
                  <select
                    value={taskModal.filterType || 'all'}
                    onChange={(e) =>
                      setTaskModal({
                        ...taskModal,
                        filterType: e.target.value as FilterType,
                      })
                    }
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="all">All Boards</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div className="w-32">
                  <label className="text-sm font-medium">Sort By</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="name">Name</option>
                    <option value="created_at">Created</option>
                    <option value="totalTasks">Tasks</option>
                    <option value="progressPercentage">Progress</option>
                  </select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setSortBy('name');
                    setSortOrder('asc');
                    setTaskModal({ ...taskModal, filterType: 'all' });
                  }}
                  className="mt-6"
                >
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Column Settings Panel */}
          {showColumnSettings && (
            <div className="mt-4 rounded-lg border bg-muted/30 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-medium">Column Settings</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowColumnSettings(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.boardName}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          boardName: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Board Name</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.totalTasks}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          totalTasks: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Total Tasks</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.progress}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          progress: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Progress</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.completedTasks}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          completedTasks: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Completed Tasks</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.activeTasks}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          activeTasks: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Active Tasks</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.overdueTasks}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          overdueTasks: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Overdue Tasks</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.createdDate}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          createdDate: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Created Date</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.lastUpdated}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          lastUpdated: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Last Updated</span>
                  </label>
                  <label className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={columnVisibility.priorityDistribution}
                      onChange={(e) =>
                        setColumnVisibility((prev) => ({
                          ...prev,
                          priorityDistribution: e.target.checked,
                        }))
                      }
                      className="rounded"
                    />
                    <span>Priority Distribution</span>
                  </label>
                </div>
                <div className="flex items-center gap-2 border-t pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={resetColumnVisibility}
                  >
                    Reset to Default
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowColumnSettings(false)}
                  >
                    Apply Changes
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Tab Content */}
          <div className="mt-6">
            {/* Table View */}
            <TabsContent value="table" className="mt-0 space-y-4">
              <CustomDataTable
                columnGenerator={projectColumns}
                namespace="basic-data-table"
                data={filteredData}
                count={hasActiveFilters ? filteredData.length : count}
                hideToolbar={true}
                defaultVisibility={{
                  id: false,
                  created_at: false,
                }}
              />
            </TabsContent>

            {/* Enhanced Cards View */}
            <TabsContent value="cards" className="mt-0 space-y-4">
              <div
                className={`grid grid-cols-1 gap-6 sm:${cardLayout} lg:${cardLayout}`}
              >
                {filteredData.map((board) => (
                  <div
                    key={board.id}
                    className="group relative cursor-pointer rounded-xl border bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-primary/20 hover:shadow-lg"
                    onClick={(e) => handleBoardClick(board, e)}
                  >
                    {/* Board Header */}
                    <div className="mb-4">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <h3 className="line-clamp-2 text-lg leading-tight font-semibold transition-colors group-hover:text-primary">
                          {board.name}
                        </h3>
                        <div className="flex items-center gap-2">
                          {board.archived && (
                            <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                              Archived
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.location.href = board.href;
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Tags */}
                      {board.tags && board.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {board.tags
                            .slice(0, 2)
                            .map((tag: string, index: number) => (
                              <span
                                key={index}
                                className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                              >
                                {tag}
                              </span>
                            ))}
                          {board.tags.length > 2 && (
                            <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                              +{board.tags.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Progress Section */}
                    <div className="mb-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">
                          Progress
                        </span>
                        <span className="text-sm font-bold">
                          {board.progressPercentage}%
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-2 rounded-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500"
                          style={{ width: `${board.progressPercentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Task Stats Grid */}
                    <div className="mb-4 grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-blue-500/10 p-2">
                          <BarChart3 className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-lg font-bold">
                            {board.totalTasks}
                          </p>
                          <p className="text-xs text-muted-foreground">Total</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-green-500/10 p-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        </div>
                        <div>
                          <p className="text-lg font-bold">
                            {board.completedTasks}
                          </p>
                          <p className="text-xs text-muted-foreground">Done</p>
                        </div>
                      </div>
                    </div>

                    {/* Alert Indicators */}
                    {(board.overdueTasks > 0 ||
                      board.highPriorityTasks > 0) && (
                      <div className="mb-3 flex items-center gap-3 rounded-lg bg-muted/50 p-2">
                        {board.overdueTasks > 0 && (
                          <div className="flex items-center gap-1 text-red-600">
                            <Clock className="h-3 w-3" />
                            <span className="text-xs font-medium">
                              {board.overdueTasks} overdue
                            </span>
                          </div>
                        )}
                        {board.highPriorityTasks > 0 && (
                          <div className="flex items-center gap-1 text-orange-600">
                            <AlertTriangle className="h-3 w-3" />
                            <span className="text-xs font-medium">
                              {board.highPriorityTasks} urgent
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>
                          {new Date(board.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="font-medium text-primary">
                          View Details
                        </span>
                        <ArrowRight className="h-3 w-3 text-primary" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Empty State */}
              {safeData.length === 0 && (
                <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-12 text-center">
                  <LayoutGrid className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-semibold">
                    No boards found
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Create your first task board to get started.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Analytics View - Gantt Chart Heatmap */}
            <TabsContent value="analytics" className="mt-0 space-y-4">
              <div className="space-y-6 pb-8">
                {/* Analytics Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">
                      Task Timeline & Performance
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {analyticsFilters.selectedBoard
                        ? `Metrics for ${safeData.find((b) => b.id === analyticsFilters.selectedBoard)?.name || 'Selected Board'}`
                        : 'Aggregate metrics across all boards'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={analyticsFilters.statusFilter}
                      onValueChange={(value) =>
                        setAnalyticsFilters((prev) => ({
                          ...prev,
                          statusFilter: value as any,
                        }))
                      }
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">📋 All Tasks</SelectItem>
                        <SelectItem value="not_started">
                          ⏸️ Not Started
                        </SelectItem>
                        <SelectItem value="active">🔄 Active</SelectItem>
                        <SelectItem value="done">✅ Done</SelectItem>
                        <SelectItem value="closed">🔒 Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={analyticsFilters.timeView}
                      onValueChange={(value) =>
                        setAnalyticsFilters((prev) => ({
                          ...prev,
                          timeView: value as 'week' | 'month' | 'year',
                        }))
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="week">Week</SelectItem>
                        <SelectItem value="month">Month</SelectItem>
                        <SelectItem value="year">Year</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={analyticsFilters.selectedBoard || 'all'}
                      onValueChange={(value) =>
                        setAnalyticsFilters((prev) => ({
                          ...prev,
                          selectedBoard: value === 'all' ? null : value,
                        }))
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Boards</SelectItem>
                        {safeData.map((board) => (
                          <SelectItem key={board.id} value={board.id}>
                            {board.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Data Quality Indicator */}
                <div className="mb-4 rounded-lg border bg-muted/50 p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <div className="rounded-full bg-green-500/10 p-1">
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                    </div>
                    <span className="font-medium">Data Status:</span>
                    <span className="text-muted-foreground">
                      {calculateAvgDuration.count > 0 ||
                      calculateTaskVelocity.thisWeek > 0 ||
                      calculateOnTimeRate.total > 0
                        ? `Analyzing ${analyticsMetrics.totalTasks} tasks with completion tracking`
                        : 'Limited data available - metrics may show N/A until tasks are completed'}
                    </span>
                  </div>
                </div>

                {/* Productivity Metrics - Now responsive to board selection */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
                  <Card className="p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="rounded-lg bg-blue-500/10 p-2">
                        <Target className="h-4 w-4 text-blue-500" />
                      </div>
                      <span className="text-sm font-medium">
                        Completion Rate
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-blue-600">
                      {Math.round(
                        (analyticsMetrics.totalCompleted /
                          analyticsMetrics.totalTasks) *
                          100
                      ) || 0}
                      %
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {analyticsMetrics.totalCompleted} of{' '}
                      {analyticsMetrics.totalTasks} tasks completed
                    </p>
                  </Card>

                  <Card className="p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="rounded-lg bg-green-500/10 p-2">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      </div>
                      <span className="text-sm font-medium">Active Tasks</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600">
                      {analyticsMetrics.totalTasks -
                        analyticsMetrics.totalCompleted}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Currently in progress
                    </p>
                  </Card>

                  <Card className="p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="rounded-lg bg-purple-500/10 p-2">
                        <Clock className="h-4 w-4 text-purple-500" />
                      </div>
                      <span className="text-sm font-medium">Avg Duration</span>
                    </div>
                    <p className="text-2xl font-bold text-purple-600">
                      {calculateAvgDuration.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {calculateAvgDuration.description}
                    </p>
                  </Card>

                  <Card className="p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="rounded-lg bg-orange-500/10 p-2">
                        <TrendingUp className="h-4 w-4 text-orange-500" />
                      </div>
                      <span className="text-sm font-medium">Task Velocity</span>
                    </div>
                    <p className="text-2xl font-bold text-orange-600">
                      {calculateTaskVelocity.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {calculateTaskVelocity.description}
                    </p>
                  </Card>

                  <Card className="p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="rounded-lg bg-emerald-500/10 p-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      </div>
                      <span className="text-sm font-medium">On-Time Rate</span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-600">
                      {calculateOnTimeRate.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {calculateOnTimeRate.description}
                    </p>
                  </Card>
                </div>

                {/* Gantt Chart Timeline */}
                <GanttChart allTasks={allTasks} filters={analyticsFilters} />

                {/* Analytics Grid - Status, Priority, and Assignee Timeline */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  {/* Status Distribution */}
                  <StatusDistribution
                    allTasks={allTasks}
                    selectedBoard={analyticsFilters.selectedBoard}
                  />

                  {/* Priority Distribution */}
                  <TaskWorkflowAnalytics
                    allTasks={allTasks}
                    selectedBoard={analyticsFilters.selectedBoard}
                  />

                  {/* Assignee Timeline */}
                  <TaskCreationAnalytics
                    allTasks={allTasks}
                    selectedBoard={analyticsFilters.selectedBoard}
                  />
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Enhanced Sidebar */}
      {sidebarOpen && selectedBoard && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={closeSidebar}
          />

          {/* Sidebar */}
          <div className="relative ml-auto h-full w-full max-w-md bg-background shadow-2xl">
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex items-center justify-between border-b p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <LayoutGrid className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold">Board Details</h2>
                    <p className="text-sm text-muted-foreground">
                      Quick overview
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={closeSidebar}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Content */}
              <div className="flex-1 space-y-6 overflow-y-auto p-6">
                {/* Board Info */}
                <div>
                  <h3 className="mb-2 text-lg font-semibold">
                    {selectedBoard}
                  </h3>

                  {/* Tags */}
                  {selectedBoardData?.tags &&
                    selectedBoardData.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedBoardData.tags.map(
                          (tag: string, index: number) => (
                            <span
                              key={index}
                              className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                            >
                              {tag}
                            </span>
                          )
                        )}
                      </div>
                    )}
                </div>

                {/* Progress Overview */}
                <div className="rounded-lg border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-medium">Overall Progress</h4>
                    <span className="text-2xl font-bold text-primary">
                      {selectedBoardData?.progressPercentage || 0}%
                    </span>
                  </div>
                  <div className="mb-3 h-3 w-full rounded-full bg-muted">
                    <div
                      className="h-3 rounded-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500"
                      style={{
                        width: `${selectedBoardData?.progressPercentage || 0}%`,
                      }}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedBoardData?.completedTasks || 0} of{' '}
                    {selectedBoardData?.totalTasks || 0} tasks completed
                  </div>
                </div>

                {/* Task Breakdown */}
                <div className="space-y-3">
                  <h4 className="font-medium">Task Breakdown</h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Total</span>
                      </div>
                      <p className="text-2xl font-bold">
                        {selectedBoardData?.totalTasks || 0}
                      </p>
                    </div>

                    <div className="rounded-lg border p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">Completed</span>
                      </div>
                      <p className="text-2xl font-bold">
                        {selectedBoardData?.completedTasks || 0}
                      </p>
                    </div>

                    <div className="rounded-lg border p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <Activity className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Active</span>
                      </div>
                      <p className="text-2xl font-bold">
                        {selectedBoardData?.activeTasks || 0}
                      </p>
                    </div>

                    <div className="rounded-lg border p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <Clock className="h-4 w-4 text-red-500" />
                        <span className="text-sm font-medium">Overdue</span>
                      </div>
                      <p className="text-2xl font-bold">
                        {selectedBoardData?.overdueTasks || 0}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Priority Breakdown */}
                {((selectedBoardData?.highPriorityTasks || 0) > 0 ||
                  (selectedBoardData?.mediumPriorityTasks || 0) > 0 ||
                  (selectedBoardData?.lowPriorityTasks || 0) > 0) && (
                  <div className="space-y-3">
                    <h4 className="font-medium">Priority Breakdown</h4>

                    <div className="space-y-2">
                      {(selectedBoardData?.highPriorityTasks || 0) > 0 && (
                        <div className="flex items-center justify-between rounded-lg bg-red-50 p-2 dark:bg-red-950/20">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            <span className="text-sm font-medium">
                              High Priority
                            </span>
                          </div>
                          <span className="font-bold">
                            {selectedBoardData?.highPriorityTasks || 0}
                          </span>
                        </div>
                      )}

                      {(selectedBoardData?.mediumPriorityTasks || 0) > 0 && (
                        <div className="flex items-center justify-between rounded-lg bg-orange-50 p-2 dark:bg-orange-950/20">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-orange-500" />
                            <span className="text-sm font-medium">
                              Medium Priority
                            </span>
                          </div>
                          <span className="font-bold">
                            {selectedBoardData?.mediumPriorityTasks || 0}
                          </span>
                        </div>
                      )}

                      {(selectedBoardData?.lowPriorityTasks || 0) > 0 && (
                        <div className="flex items-center justify-between rounded-lg bg-green-50 p-2 dark:bg-green-950/20">
                          <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium">
                              Low Priority
                            </span>
                          </div>
                          <span className="font-bold">
                            {selectedBoardData?.lowPriorityTasks || 0}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Board Meta */}
                <div className="space-y-3">
                  <h4 className="font-medium">Board Information</h4>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <span>
                        {selectedBoardData?.created_at
                          ? new Date(
                              selectedBoardData.created_at
                            ).toLocaleDateString()
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span
                        className={
                          selectedBoardData?.archived
                            ? 'text-muted-foreground'
                            : 'text-green-600'
                        }
                      >
                        {selectedBoardData?.archived ? 'Archived' : 'Active'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="border-t p-6">
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() =>
                      (window.location.href = selectedBoardData?.href || '')
                    }
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Open Board
                  </Button>
                  <Button variant="outline" onClick={closeSidebar}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task List Modal */}
      <Dialog open={taskModal.isOpen} onOpenChange={closeTaskModal}>
        <DialogContent className="flex h-[85vh] max-w-6xl flex-col p-0">
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex-shrink-0 border-b p-6 pb-4">
              <DialogHeader className="mb-4">
                <DialogTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  {taskModal.filterType === 'all' && 'All Tasks'}
                  {taskModal.filterType === 'completed' && 'Completed Tasks'}
                  {taskModal.filterType === 'overdue' && 'Overdue Tasks'}
                  {taskModal.filterType === 'urgent' && 'Urgent Priority Tasks'}
                  <Badge variant="secondary" className="ml-2">
                    {filteredTasks.length} tasks
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              {/* Modal Controls */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select
                    value={taskModal.selectedBoard || 'all'}
                    onValueChange={(value) =>
                      setTaskModal((prev) => ({
                        ...prev,
                        selectedBoard: value === 'all' ? null : value,
                      }))
                    }
                  >
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue placeholder="Filter by board" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Boards</SelectItem>
                      {safeData.map((board) => (
                        <SelectItem key={board.id} value={board.id}>
                          {board.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" onClick={refreshTasks}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </div>

            {/* Scrollable Task Groups */}
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="space-y-4 p-6">
                  {/* Not Started Tasks */}
                  <TaskGroup
                    title="Not Started"
                    icon={<div className="h-3 w-3 rounded-full bg-gray-400" />}
                    tasks={groupedTasks.not_started}
                    count={groupedTasks.not_started.length}
                    onTaskClick={handleTaskClick}
                  />

                  {/* Active Tasks */}
                  <TaskGroup
                    title="Active"
                    icon={<div className="h-3 w-3 rounded-full bg-blue-500" />}
                    tasks={groupedTasks.active}
                    count={groupedTasks.active.length}
                    onTaskClick={handleTaskClick}
                  />

                  {/* Done Tasks */}
                  <TaskGroup
                    title="Done"
                    icon={<div className="h-3 w-3 rounded-full bg-green-500" />}
                    tasks={groupedTasks.done}
                    count={groupedTasks.done.length}
                    onTaskClick={handleTaskClick}
                  />

                  {/* Closed Tasks */}
                  <TaskGroup
                    title="Closed"
                    icon={
                      <div className="h-3 w-3 rounded-full bg-purple-500" />
                    }
                    tasks={groupedTasks.closed}
                    count={groupedTasks.closed.length}
                    onTaskClick={handleTaskClick}
                  />
                </div>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
