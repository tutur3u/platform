'use client';

import { useState, useMemo } from 'react';
import { CustomDataTable } from '@/components/custom-data-table';
import { TaskBoard, Task, TaskList } from '@tuturuuu/types/primitives/TaskBoard';
import { Button } from '@tuturuuu/ui/button';
import {
  Columns3,
  Filter,
  LayoutGrid,
  LayoutList,
  RefreshCw,
  Settings2,
  SortAsc,
  BarChart3,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Calendar,
  TrendingUp,
  Users,
  Eye,
  X,
  ArrowRight,
  Target,
  Activity,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Zap,
} from '@tuturuuu/ui/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@tuturuuu/ui/dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@tuturuuu/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@tuturuuu/ui/collapsible';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import { projectColumns } from './columns';

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

type TaskStatus = 'not_started' | 'active' | 'done' | 'closed';
type FilterType = 'all' | 'completed' | 'overdue' | 'urgent';

interface TaskModalState {
  isOpen: boolean;
  filterType: FilterType;
  selectedBoard: string | null; // null means all boards
}

interface AnalyticsFilters {
  timeView: 'week' | 'month' | 'year';
  selectedBoard: string | null;
}

export function EnhancedBoardsView({ data, count }: EnhancedBoardsViewProps) {
  const [selectedBoard, setSelectedBoard] = useState<typeof data[0] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [taskModal, setTaskModal] = useState<TaskModalState>({
    isOpen: false,
    filterType: 'all',
    selectedBoard: null,
  });

  const [analyticsFilters, setAnalyticsFilters] = useState<AnalyticsFilters>({
    timeView: 'month',
    selectedBoard: null
  });

  // Calculate aggregate metrics for the quick stats
  const totalTasks = data.reduce((sum, board) => sum + board.totalTasks, 0);
  const totalCompleted = data.reduce((sum, board) => sum + board.completedTasks, 0);
  const totalOverdue = data.reduce((sum, board) => sum + board.overdueTasks, 0);
  const totalHighPriority = data.reduce((sum, board) => sum + board.highPriorityTasks, 0);
  const avgProgress = data.length > 0 ? Math.round(data.reduce((sum, board) => sum + board.progressPercentage, 0) / data.length) : 0;

  // Get all tasks across all boards for filtering
  const allTasks = useMemo(() => {
    return data.flatMap(board => 
      (board.task_lists || []).flatMap(list => 
        (list.tasks || []).map(task => ({
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
  }, [data]);

  // Filter tasks based on modal state
  const filteredTasks = useMemo(() => {
    let tasks = allTasks;

    // Filter by board if specified
    if (taskModal.selectedBoard && taskModal.selectedBoard !== 'all') {
      tasks = tasks.filter(task => task.boardId === taskModal.selectedBoard);
    }

    // Filter by type
    switch (taskModal.filterType) {
      case 'completed':
        return tasks.filter(task => 
          task.archived || task.listStatus === 'done' || task.listStatus === 'closed'
        );
      case 'overdue':
        return tasks.filter(task => 
          !task.archived && 
          task.listStatus !== 'done' && 
          task.listStatus !== 'closed' && 
          task.end_date && 
          new Date(task.end_date) < new Date()
        );
      case 'urgent':
        return tasks.filter(task => 
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

    filteredTasks.forEach(task => {
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

  const handleBoardClick = (board: typeof data[0], e: React.MouseEvent) => {
    e.preventDefault();
    setSelectedBoard(board);
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

  const handleTaskClick = (task: typeof filteredTasks[0]) => {
    // Navigate to the task's board page
    window.location.href = `${task.boardHref}?taskId=${task.id}`;
  };

  const refreshTasks = () => {
    // Refresh the page to reload data
    window.location.reload();
  };

  return (
    <>
      {/* Enhanced Quick Stats - Now Clickable */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div 
          className="rounded-xl border bg-gradient-to-br from-blue-50 to-blue-100/50 p-4 transition-all hover:shadow-md hover:scale-105 cursor-pointer dark:from-blue-950/20 dark:to-blue-900/10"
          onClick={() => openTaskModal('all')}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Tasks</p>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{totalTasks}</p>
            </div>
          </div>
        </div>

        <div 
          className="rounded-xl border bg-gradient-to-br from-green-50 to-green-100/50 p-4 transition-all hover:shadow-md hover:scale-105 cursor-pointer dark:from-green-950/20 dark:to-green-900/10"
          onClick={() => openTaskModal('completed')}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-500/10 p-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-300">Completed</p>
              <p className="text-2xl font-bold text-green-900 dark:text-green-100">{totalCompleted}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-gradient-to-br from-purple-50 to-purple-100/50 p-4 transition-all hover:shadow-md dark:from-purple-950/20 dark:to-purple-900/10">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-500/10 p-2">
              <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-purple-700 dark:text-purple-300">Analytics</p>
              <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">{avgProgress}%</p>
            </div>
          </div>
        </div>

        <div 
          className="rounded-xl border bg-gradient-to-br from-red-50 to-red-100/50 p-4 transition-all hover:shadow-md hover:scale-105 cursor-pointer dark:from-red-950/20 dark:to-red-900/10"
          onClick={() => openTaskModal('overdue')}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-500/10 p-2">
              <Clock className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-300">Overdue</p>
              <p className="text-2xl font-bold text-red-900 dark:text-red-100">{totalOverdue}</p>
            </div>
          </div>
        </div>

        <div 
          className="rounded-xl border bg-gradient-to-br from-orange-50 to-orange-100/50 p-4 transition-all hover:shadow-md hover:scale-105 cursor-pointer dark:from-orange-950/20 dark:to-orange-900/10"
          onClick={() => openTaskModal('urgent')}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-orange-500/10 p-2">
              <Zap className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-orange-700 dark:text-orange-300">Urgent Priority</p>
              <p className="text-2xl font-bold text-orange-900 dark:text-orange-100">{totalHighPriority}</p>
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
              <TabsContent value="table" className="m-0 data-[state=inactive]:hidden">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Filter className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <SortAsc className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                  <div className="mx-1 h-4 w-px bg-border" />
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Columns3 className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              {/* Cards View Actions */}
              <TabsContent value="cards" className="m-0 data-[state=inactive]:hidden">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Filter className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <SortAsc className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              {/* Analytics View Actions */}
              <TabsContent value="analytics" className="m-0 data-[state=inactive]:hidden">
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Filter className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Calendar className="h-4 w-4" />
                  </Button>
                </div>
              </TabsContent>

              {/* Global Actions */}
              <div className="mx-1 h-4 w-px bg-border" />
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={refreshTasks}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="mt-6">
            {/* Table View */}
            <TabsContent value="table" className="mt-0 space-y-4">
              <CustomDataTable
                columnGenerator={projectColumns}
                namespace="basic-data-table"
                data={data}
                count={count}
                hideToolbar={true}
                defaultVisibility={{
                  id: false,
                  created_at: false,
                }}
              />
            </TabsContent>

            {/* Enhanced Cards View */}
            <TabsContent value="cards" className="mt-0 space-y-4">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {data.map((board) => (
                  <div
                    key={board.id}
                    className="group relative rounded-xl border bg-card p-6 shadow-sm transition-all duration-200 hover:shadow-lg hover:border-primary/20 hover:-translate-y-1 cursor-pointer"
                    onClick={(e) => handleBoardClick(board, e)}
                  >
                    {/* Board Header */}
                    <div className="mb-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <h3 className="font-semibold text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">
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
                            className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.location.href = board.href;
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      
                      {/* Description Preview */}
                      {board.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                          {board.description}
                        </p>
                      )}
                      
                      {/* Tags */}
                      {board.tags && board.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {board.tags.slice(0, 2).map((tag: string, index: number) => (
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
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-muted-foreground">Progress</span>
                        <span className="text-sm font-bold">{board.progressPercentage}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-primary to-primary/80 rounded-full h-2 transition-all duration-500"
                          style={{ width: `${board.progressPercentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Task Stats Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-blue-500/10 p-2">
                          <BarChart3 className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-lg font-bold">{board.totalTasks}</p>
                          <p className="text-xs text-muted-foreground">Total</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg bg-green-500/10 p-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        </div>
                        <div>
                          <p className="text-lg font-bold">{board.completedTasks}</p>
                          <p className="text-xs text-muted-foreground">Done</p>
                        </div>
                      </div>
                    </div>

                    {/* Alert Indicators */}
                    {(board.overdueTasks > 0 || board.highPriorityTasks > 0) && (
                      <div className="flex items-center gap-3 mb-3 p-2 rounded-lg bg-muted/50">
                        {board.overdueTasks > 0 && (
                          <div className="flex items-center gap-1 text-red-600">
                            <Clock className="h-3 w-3" />
                            <span className="text-xs font-medium">{board.overdueTasks} overdue</span>
                          </div>
                        )}
                        {board.highPriorityTasks > 0 && (
                          <div className="flex items-center gap-1 text-orange-600">
                            <AlertTriangle className="h-3 w-3" />
                            <span className="text-xs font-medium">{board.highPriorityTasks} urgent</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{new Date(board.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-primary font-medium">View Details</span>
                        <ArrowRight className="h-3 w-3 text-primary" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Empty State */}
              {data.length === 0 && (
                <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-12 text-center">
                  <LayoutGrid className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-semibold">No boards found</h3>
                  <p className="text-sm text-muted-foreground">
                    Create your first task board to get started.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Analytics View - Gantt Chart Heatmap */}
            <TabsContent value="analytics" className="mt-0 space-y-4">
              <div className="space-y-6">
                {/* Analytics Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Task Analytics & Productivity</h3>
                    <p className="text-sm text-muted-foreground">
                      Visual representation of task creation and completion patterns
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select 
                      value={analyticsFilters.timeView} 
                      onValueChange={(value) => setAnalyticsFilters(prev => ({ ...prev, timeView: value as 'week' | 'month' | 'year' }))}
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
                      onValueChange={(value) => setAnalyticsFilters(prev => ({ ...prev, selectedBoard: value === 'all' ? null : value }))}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Boards</SelectItem>
                        {data.map(board => (
                          <SelectItem key={board.id} value={board.id}>{board.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Productivity Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="rounded-lg bg-blue-500/10 p-2">
                        <Target className="h-4 w-4 text-blue-500" />
                      </div>
                      <span className="text-sm font-medium">Completion Rate</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-600">{Math.round((totalCompleted / totalTasks) * 100) || 0}%</p>
                    <p className="text-xs text-muted-foreground">Overall completion</p>
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="rounded-lg bg-green-500/10 p-2">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                      </div>
                      <span className="text-sm font-medium">Active Tasks</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600">{totalTasks - totalCompleted}</p>
                    <p className="text-xs text-muted-foreground">In progress</p>
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="rounded-lg bg-purple-500/10 p-2">
                        <Activity className="h-4 w-4 text-purple-500" />
                      </div>
                      <span className="text-sm font-medium">Total Boards</span>
                    </div>
                    <p className="text-2xl font-bold text-purple-600">{data.length}</p>
                    <p className="text-xs text-muted-foreground">Active projects</p>
                  </Card>

                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="rounded-lg bg-orange-500/10 p-2">
                        <Clock className="h-4 w-4 text-orange-500" />
                      </div>
                      <span className="text-sm font-medium">Overdue</span>
                    </div>
                    <p className="text-2xl font-bold text-orange-600">{totalOverdue}</p>
                    <p className="text-xs text-muted-foreground">Need attention</p>
                  </Card>
                </div>

                {/* Gantt Chart Timeline */}
                <GanttChart 
                  allTasks={allTasks} 
                  data={data}
                  filters={analyticsFilters}
                />

                {/* Analytics Grid - Status, Priority, and Assignee Timeline */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Status Distribution */}
                  <StatusDistribution 
                    allTasks={allTasks} 
                    selectedBoard={analyticsFilters.selectedBoard}
                  />
                  
                  {/* Priority Distribution */}
                  <PriorityDistribution 
                    allTasks={allTasks} 
                    selectedBoard={analyticsFilters.selectedBoard}
                  />
                  
                  {/* Assignee Timeline */}
                  <AssigneeTimeline 
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
                    <p className="text-sm text-muted-foreground">Quick overview</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={closeSidebar}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Board Info */}
                <div>
                  <h3 className="font-semibold text-lg mb-2">{selectedBoard.name}</h3>
                  {selectedBoard.description && (
                    <p className="text-sm text-muted-foreground mb-4">
                      {selectedBoard.description}
                    </p>
                  )}
                  
                  {/* Tags */}
                  {selectedBoard.tags && selectedBoard.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selectedBoard.tags.map((tag: string, index: number) => (
                        <span
                          key={index}
                          className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Progress Overview */}
                <div className="rounded-lg border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">Overall Progress</h4>
                    <span className="text-2xl font-bold text-primary">{selectedBoard.progressPercentage}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3 mb-3">
                    <div 
                      className="bg-gradient-to-r from-primary to-primary/80 rounded-full h-3 transition-all duration-500"
                      style={{ width: `${selectedBoard.progressPercentage}%` }}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedBoard.completedTasks} of {selectedBoard.totalTasks} tasks completed
                  </div>
                </div>

                {/* Task Breakdown */}
                <div className="space-y-3">
                  <h4 className="font-medium">Task Breakdown</h4>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <BarChart3 className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Total</span>
                      </div>
                      <p className="text-2xl font-bold">{selectedBoard.totalTasks}</p>
                    </div>
                    
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">Completed</span>
                      </div>
                      <p className="text-2xl font-bold">{selectedBoard.completedTasks}</p>
                    </div>
                    
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Activity className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Active</span>
                      </div>
                      <p className="text-2xl font-bold">{selectedBoard.activeTasks}</p>
                    </div>
                    
                    <div className="rounded-lg border p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-red-500" />
                        <span className="text-sm font-medium">Overdue</span>
                      </div>
                      <p className="text-2xl font-bold">{selectedBoard.overdueTasks}</p>
                    </div>
                  </div>
                </div>

                {/* Priority Breakdown */}
                {(selectedBoard.highPriorityTasks > 0 || selectedBoard.mediumPriorityTasks > 0 || selectedBoard.lowPriorityTasks > 0) && (
                  <div className="space-y-3">
                    <h4 className="font-medium">Priority Breakdown</h4>
                    
                    <div className="space-y-2">
                      {selectedBoard.highPriorityTasks > 0 && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-red-50 dark:bg-red-950/20">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            <span className="text-sm font-medium">High Priority</span>
                          </div>
                          <span className="font-bold">{selectedBoard.highPriorityTasks}</span>
                        </div>
                      )}
                      
                      {selectedBoard.mediumPriorityTasks > 0 && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-orange-50 dark:bg-orange-950/20">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-orange-500" />
                            <span className="text-sm font-medium">Medium Priority</span>
                          </div>
                          <span className="font-bold">{selectedBoard.mediumPriorityTasks}</span>
                        </div>
                      )}
                      
                      {selectedBoard.lowPriorityTasks > 0 && (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-green-50 dark:bg-green-950/20">
                          <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium">Low Priority</span>
                          </div>
                          <span className="font-bold">{selectedBoard.lowPriorityTasks}</span>
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
                      <span>{new Date(selectedBoard.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span className={selectedBoard.archived ? "text-muted-foreground" : "text-green-600"}>
                        {selectedBoard.archived ? "Archived" : "Active"}
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
                    onClick={() => window.location.href = selectedBoard.href}
                  >
                    <Eye className="h-4 w-4 mr-2" />
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
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0">
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex-shrink-0 p-6 pb-4 border-b">
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
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Select 
                    value={taskModal.selectedBoard || 'all'} 
                    onValueChange={(value) => setTaskModal(prev => ({ 
                      ...prev, 
                      selectedBoard: value === 'all' ? null : value 
                    }))}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filter by board" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Boards</SelectItem>
                      {data.map(board => (
                        <SelectItem key={board.id} value={board.id}>{board.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="sm" onClick={refreshTasks}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </div>

            {/* Scrollable Task Groups */}
            <div className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-6 space-y-4">
                  {/* Not Started Tasks */}
                  <TaskGroup
                    title="Not Started"
                    icon={<div className="w-3 h-3 rounded-full bg-gray-400" />}
                    tasks={groupedTasks.not_started}
                    count={groupedTasks.not_started.length}
                    onTaskClick={handleTaskClick}
                  />

                  {/* Active Tasks */}
                  <TaskGroup
                    title="Active"
                    icon={<div className="w-3 h-3 rounded-full bg-blue-500" />}
                    tasks={groupedTasks.active}
                    count={groupedTasks.active.length}
                    onTaskClick={handleTaskClick}
                  />

                  {/* Done Tasks */}
                  <TaskGroup
                    title="Done"
                    icon={<div className="w-3 h-3 rounded-full bg-green-500" />}
                    tasks={groupedTasks.done}
                    count={groupedTasks.done.length}
                    onTaskClick={handleTaskClick}
                  />

                  {/* Closed Tasks */}
                  <TaskGroup
                    title="Closed"
                    icon={<div className="w-3 h-3 rounded-full bg-purple-500" />}
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

// Task Group Component for collapsible sections
interface TaskGroupProps {
  title: string;
  icon: React.ReactNode;
  tasks: Array<{
    id: string;
    name: string;
    description?: string;
    priority?: number | null;
    end_date?: string | null;
    boardName: string;
    listName: string;
    boardHref?: string;
  }>;
  count: number;
  onTaskClick: (task: any) => void;
}

function TaskGroup({ title, icon, tasks, count, onTaskClick }: TaskGroupProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (count === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between p-3 h-auto hover:bg-muted/50"
        >
          <div className="flex items-center gap-3">
            {icon}
            <span className="font-medium">{title}</span>
            <Badge variant="secondary" className="ml-2">
              {count}
            </Badge>
          </div>
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="space-y-2 pt-2">
        {tasks.map((task) => (
          <Card
            key={task.id}
            className="group p-3 hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => onTaskClick(task)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-sm truncate">{task.name}</h4>
                  {task.priority === 1 && (
                    <Badge variant="destructive" className="text-xs">
                      Urgent
                    </Badge>
                  )}
                  {task.priority === 2 && (
                    <Badge variant="secondary" className="text-xs">
                      High
                    </Badge>
                  )}
                </div>
                
                {task.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                    {task.description}
                  </p>
                )}
                
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <LayoutGrid className="h-3 w-3" />
                    {task.boardName}
                  </span>
                  <span className="flex items-center gap-1">
                    <LayoutList className="h-3 w-3" />
                    {task.listName}
                  </span>
                  {task.end_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(task.end_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  onTaskClick(task);
                }}
              >
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </Card>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// Gantt Chart Component
function GanttChart({ allTasks, data, filters }: { 
  allTasks: any[], 
  data: any[], 
  filters: AnalyticsFilters 
}) {
  // Filter tasks based on selected board
  const filteredTasks = useMemo(() => {
    if (!filters.selectedBoard) return allTasks;
    return allTasks.filter(task => task.boardId === filters.selectedBoard);
  }, [allTasks, filters.selectedBoard]);

  // Get time range based on filter
  const getTimeRange = () => {
    const now = new Date();
    switch (filters.timeView) {
      case 'week':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return { start: weekStart, end: weekEnd };
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { start: monthStart, end: monthEnd };
      case 'year':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const yearEnd = new Date(now.getFullYear(), 11, 31);
        return { start: yearStart, end: yearEnd };
    }
  };

  const timeRange = getTimeRange();
  const totalDays = Math.ceil((timeRange.end.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60 * 24));

  // Calculate productivity stats
  const productivityStats = useMemo(() => {
    const completed = filteredTasks.filter(task => 
      task.listStatus === 'done' || task.listStatus === 'closed'
    ).length;
    const total = filteredTasks.length;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;
    
    const overdue = filteredTasks.filter(task => 
      task.end_date && 
      new Date(task.end_date) < new Date() && 
      task.listStatus !== 'done' && 
      task.listStatus !== 'closed'
    ).length;
    
    const onTime = completed - overdue;
    const onTimeRate = completed > 0 ? (onTime / completed) * 100 : 0;

    return {
      completionRate: completionRate.toFixed(1),
      onTimeRate: onTimeRate.toFixed(1),
      totalTasks: total,
      completedTasks: completed,
      overdueTasks: overdue
    };
  }, [filteredTasks]);

  // Process tasks for Gantt display
  const ganttTasks = useMemo(() => {
    return filteredTasks
      .filter(task => task.created_at) // Only tasks with creation date
      .map(task => {
        const createdDate = new Date(task.created_at);
        const endDate = task.listStatus === 'done' || task.listStatus === 'closed' 
          ? (task.updated_at ? new Date(task.updated_at) : createdDate)
          : (task.end_date ? new Date(task.end_date) : new Date());
        
        // Calculate position and width
        const startOffset = Math.max(0, 
          (createdDate.getTime() - timeRange.start.getTime()) / (1000 * 60 * 60 * 24)
        );
        const duration = Math.max(1, 
          (endDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        
        return {
          ...task,
          createdDate,
          endDate,
          startOffset: (startOffset / totalDays) * 100,
          width: Math.min((duration / totalDays) * 100, 100 - (startOffset / totalDays) * 100),
          status: task.listStatus || 'not_started'
        };
      })
      .filter(task => task.startOffset < 100) // Only show tasks within time range
      .sort((a, b) => a.createdDate.getTime() - b.createdDate.getTime())
      .slice(0, 15); // Limit to 15 tasks for readability
  }, [filteredTasks, timeRange, totalDays]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done':
      case 'closed':
        return 'bg-green-500';
      case 'active':
        return 'bg-blue-500';
      case 'not_started':
      default:
        return 'bg-gray-400';
    }
  };

  // Generate time markers
  const timeMarkers = useMemo(() => {
    const markers = [];
    const markerCount = filters.timeView === 'week' ? 7 : filters.timeView === 'month' ? 4 : 12;
    
    for (let i = 0; i <= markerCount; i++) {
      const position = (i / markerCount) * 100;
      const date = new Date(timeRange.start);
      
      if (filters.timeView === 'week') {
        date.setDate(date.getDate() + i);
        markers.push({ position, label: date.toLocaleDateString('en', { weekday: 'short' }) });
      } else if (filters.timeView === 'month') {
        date.setDate(date.getDate() + (i * 7));
        markers.push({ position, label: `Week ${i + 1}` });
      } else {
        date.setMonth(date.getMonth() + i);
        markers.push({ position, label: date.toLocaleDateString('en', { month: 'short' }) });
      }
    }
    return markers;
  }, [filters.timeView, timeRange]);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h4 className="font-medium">Task Gantt Timeline</h4>
          <p className="text-sm text-muted-foreground">
            Visual timeline showing task lifecycle from creation to completion
          </p>
        </div>
        
        {/* Productivity Stats */}
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center">
            <div className="font-semibold text-green-600">{productivityStats.completionRate}%</div>
            <div className="text-muted-foreground">Completion</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-blue-600">{productivityStats.onTimeRate}%</div>
            <div className="text-muted-foreground">On-Time</div>
          </div>
          <div className="text-center">
            <div className="font-semibold text-purple-600">{productivityStats.totalTasks}</div>
            <div className="text-muted-foreground">Total</div>
          </div>
        </div>
      </div>

      {/* Time Scale */}
      <div className="relative mb-4">
        <div className="flex justify-between text-xs text-muted-foreground border-b pb-2">
          {timeMarkers.map((marker, index) => (
            <div key={index} style={{ position: 'absolute', left: `${marker.position}%` }}>
              {marker.label}
            </div>
          ))}
        </div>
      </div>

      {/* Gantt Chart */}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {ganttTasks.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No tasks found for the selected time period
          </div>
        ) : (
          ganttTasks.map((task, index) => (
            <div key={task.id} className="flex items-center gap-3 py-1">
              {/* Task Name */}
              <div className="w-48 text-sm font-medium truncate" title={task.name}>
                {task.name}
              </div>
              
              {/* Timeline Bar */}
              <div className="flex-1 relative h-6 bg-gray-100 dark:bg-gray-800 rounded">
                <div
                  className={cn(
                    "absolute h-full rounded transition-all hover:opacity-80",
                    getStatusColor(task.status)
                  )}
                  style={{
                    left: `${task.startOffset}%`,
                    width: `${task.width}%`
                  }}
                  title={`${task.name} (${task.createdDate.toLocaleDateString()} - ${task.endDate.toLocaleDateString()})`}
                >
                  <div className="flex items-center justify-center h-full text-white text-xs font-medium">
                    {task.status === 'done' || task.status === 'closed' ? '✓' : ''}
                  </div>
                </div>
              </div>
              
              {/* Status Badge */}
              <div className="w-20 text-xs">
                <Badge 
                  variant={task.status === 'done' || task.status === 'closed' ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {task.status === 'done' ? 'Done' : 
                   task.status === 'closed' ? 'Closed' :
                   task.status === 'active' ? 'Active' : 'Not Started'}
                </Badge>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 pt-4 border-t text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-gray-400 rounded"></div>
          <span>Not Started</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-blue-500 rounded"></div>
          <span>Active</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span>Completed</span>
        </div>
      </div>
    </Card>
  );
}

// Status Distribution Component
function StatusDistribution({ allTasks, selectedBoard }: { allTasks: any[], selectedBoard: string | null }) {
  const filteredTasks = useMemo(() => {
    if (!selectedBoard) return allTasks;
    return allTasks.filter(task => task.boardId === selectedBoard);
  }, [allTasks, selectedBoard]);

  const statusCounts = useMemo(() => {
    const counts = {
      'not_started': 0,
      'active': 0,
      'done': 0,
      'closed': 0
    };

    filteredTasks.forEach(task => {
      const status = task.listStatus || 'not_started';
      if (status === 'done' || task.archived) {
        counts.done += 1;
      } else if (status === 'closed') {
        counts.closed += 1;
      } else if (status === 'active') {
        counts.active += 1;
      } else {
        counts.not_started += 1;
      }
    });

    return counts;
  }, [filteredTasks]);

  const total = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

  const statusConfig = [
    { key: 'not_started', label: 'Not Started', color: 'bg-gray-400', percentage: total > 0 ? (statusCounts.not_started / total) * 100 : 0 },
    { key: 'active', label: 'Active', color: 'bg-blue-500', percentage: total > 0 ? (statusCounts.active / total) * 100 : 0 },
    { key: 'done', label: 'Done', color: 'bg-green-500', percentage: total > 0 ? (statusCounts.done / total) * 100 : 0 },
    { key: 'closed', label: 'Closed', color: 'bg-purple-500', percentage: total > 0 ? (statusCounts.closed / total) * 100 : 0 }
  ];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium">Status Distribution</h4>
        <span className="text-xs text-muted-foreground">{total} tasks</span>
      </div>
      <div className="space-y-3">
        {statusConfig.map(status => (
          <div key={status.key} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn("w-3 h-3 rounded", status.color)}></div>
                <span className="text-sm">{status.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{statusCounts[status.key as keyof typeof statusCounts]}</span>
                <span className="text-xs text-muted-foreground">({status.percentage.toFixed(0)}%)</span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div 
                className={cn("h-1.5 rounded-full transition-all", status.color)}
                style={{ width: `${status.percentage}%` }}
              />
            </div>
          </div>
        ))}
        {total === 0 && (
          <div className="text-center text-sm text-muted-foreground py-4">
            No tasks found
          </div>
        )}
      </div>
    </Card>
  );
}

// Priority Distribution Component  
function PriorityDistribution({ allTasks, selectedBoard }: { allTasks: any[], selectedBoard: string | null }) {
  const filteredTasks = useMemo(() => {
    if (!selectedBoard) return allTasks;
    return allTasks.filter(task => task.boardId === selectedBoard);
  }, [allTasks, selectedBoard]);

  const priorityCounts = useMemo(() => {
    const counts = {
      'URGENT': 0,
      'HIGH': 0,
      'MEDIUM': 0,
      'LOW': 0,
      'UNASSIGNED': 0
    };

    filteredTasks.forEach(task => {
      if (task.priority === 1) {
        counts.URGENT += 1;
      } else if (task.priority === 2) {
        counts.HIGH += 1;
      } else if (task.priority === 3) {
        counts.MEDIUM += 1;
      } else if (task.priority === 4) {
        counts.LOW += 1;
      } else {
        counts.UNASSIGNED += 1;
      }
    });

    return counts;
  }, [filteredTasks]);

  const total = Object.values(priorityCounts).reduce((sum, count) => sum + count, 0);

  const priorityConfig = [
    { key: 'URGENT', label: 'Urgent', color: 'bg-red-500', percentage: total > 0 ? (priorityCounts.URGENT / total) * 100 : 0 },
    { key: 'HIGH', label: 'High', color: 'bg-orange-500', percentage: total > 0 ? (priorityCounts.HIGH / total) * 100 : 0 },
    { key: 'MEDIUM', label: 'Medium', color: 'bg-yellow-500', percentage: total > 0 ? (priorityCounts.MEDIUM / total) * 100 : 0 },
    { key: 'LOW', label: 'Low', color: 'bg-green-500', percentage: total > 0 ? (priorityCounts.LOW / total) * 100 : 0 },
    { key: 'UNASSIGNED', label: 'No Priority Set', color: 'bg-gray-300 dark:bg-gray-600', percentage: total > 0 ? (priorityCounts.UNASSIGNED / total) * 100 : 0 }
  ];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium">Priority Distribution</h4>
        <span className="text-xs text-muted-foreground">{total} tasks</span>
      </div>
      <div className="space-y-3">
        {priorityConfig.map(priority => (
          <div key={priority.key} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn("w-3 h-3 rounded", priority.color)}></div>
                <span className="text-sm">{priority.label}</span>
                {priority.key === 'UNASSIGNED' && (
                  <span className="text-xs text-muted-foreground ml-1">📋</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{priorityCounts[priority.key as keyof typeof priorityCounts]}</span>
                <span className="text-xs text-muted-foreground">({priority.percentage.toFixed(0)}%)</span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
              <div 
                className={cn("h-1.5 rounded-full transition-all", priority.color)}
                style={{ width: `${priority.percentage}%` }}
              />
            </div>
          </div>
        ))}
        {total === 0 && (
          <div className="text-center text-sm text-muted-foreground py-4">
            No tasks found
          </div>
        )}
      </div>
    </Card>
  );
}

// Assignee Timeline Component
function AssigneeTimeline({ allTasks, selectedBoard }: { allTasks: any[], selectedBoard: string | null }) {
  const filteredTasks = useMemo(() => {
    if (!selectedBoard) return allTasks;
    return allTasks.filter(task => task.boardId === selectedBoard);
  }, [allTasks, selectedBoard]);

  const assigneeStats = useMemo(() => {
    const stats: { [key: string]: { total: number, completed: number, name: string } } = {};
    
    filteredTasks.forEach(task => {
      // Use assignee if available, otherwise use "Unassigned"
      const assigneeId = task.assignee_id || 'unassigned';
      const assigneeName = task.assignee_name || 'Unassigned';
      
      if (!stats[assigneeId]) {
        stats[assigneeId] = { total: 0, completed: 0, name: assigneeName };
      }
      
      stats[assigneeId].total += 1;
      if (task.listStatus === 'done' || task.listStatus === 'closed' || task.archived) {
        stats[assigneeId].completed += 1;
      }
    });

    // Convert to array and sort by total tasks
    return Object.entries(stats)
      .map(([id, data]) => ({
        id,
        name: data.name,
        total: data.total,
        completed: data.completed,
        completionRate: data.total > 0 ? (data.completed / data.total) * 100 : 0
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6); // Show top 6 assignees
  }, [filteredTasks]);

  const totalTasks = filteredTasks.length;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium">Assignee Performance</h4>
        <span className="text-xs text-muted-foreground">{totalTasks} tasks</span>
      </div>
      <div className="space-y-3">
        {assigneeStats.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-4">
            No assignee data found
          </div>
        ) : (
          assigneeStats.map((assignee) => (
            <div key={assignee.id} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-medium">
                    {assignee.id === 'unassigned' ? '📋' : assignee.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-sm font-medium">{assignee.name}</span>
                    {assignee.id === 'unassigned' && (
                      <span className="text-xs text-muted-foreground ml-1">(no assignee)</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">{assignee.completed}/{assignee.total}</div>
                  <div className="text-xs text-muted-foreground">{assignee.completionRate.toFixed(0)}%</div>
                </div>
              </div>
              
              {/* Progress bar */}
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div className="flex h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-green-500 transition-all"
                    style={{ width: `${assignee.completionRate}%` }}
                  />
                  <div 
                    className="bg-blue-200 dark:bg-blue-800 transition-all"
                    style={{ width: `${100 - assignee.completionRate}%` }}
                  />
                </div>
              </div>
              
              {/* Task breakdown */}
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{assignee.completed} completed</span>
                <span>{assignee.total - assignee.completed} remaining</span>
              </div>
            </div>
          ))
        )}
      </div>
      
      {assigneeStats.length > 0 && (
        <div className="mt-4 pt-3 border-t">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <div className="text-lg font-semibold text-green-600">
                {Math.round(assigneeStats.reduce((sum, a) => sum + a.completionRate, 0) / assigneeStats.length)}%
              </div>
              <div className="text-xs text-muted-foreground">Avg Completion</div>
            </div>
            <div>
              <div className="text-lg font-semibold text-blue-600">
                {assigneeStats.length}
              </div>
              <div className="text-xs text-muted-foreground">Active Assignees</div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
} 