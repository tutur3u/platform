'use client';

import { projectColumns } from './columns';
import { CustomDataTable } from '@/components/custom-data-table';
import {
  Task,
  TaskBoard,
  TaskList,
} from '@tuturuuu/types/primitives/TaskBoard';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns3,
  ExternalLink,
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
import { useEffect, useMemo, useRef, useState } from 'react';

interface AnalyticsFilters {
  timeView: 'week' | 'month' | 'year';
  selectedBoard: string | null;
  statusFilter: 'all' | 'not_started' | 'active' | 'done' | 'closed';
}

// Gantt Chart Component
function GanttChart({
  allTasks,
  filters,
}: {
  allTasks: any[];
  filters: AnalyticsFilters;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [searchQuery, setSearchQuery] = useState('');
  const [clickCardVisible, setClickCardVisible] = useState(false);
  const [clickCardPosition, setClickCardPosition] = useState({ x: 0, y: 0 });
  const [clickedTask, setClickedTask] = useState<any | null>(null);
  const clickCardRef = useRef<HTMLDivElement>(null);

  // Filter tasks based on selected board, status, and search
  const filteredTasks = useMemo(() => {
    let tasks = allTasks;

    // Filter by board
    if (filters.selectedBoard) {
      tasks = tasks.filter((task) => task.boardId === filters.selectedBoard);
    }

    // Filter by status
    if (filters.statusFilter !== 'all') {
      tasks = tasks.filter((task) => {
        const taskStatus = task.listStatus || 'not_started';
        return taskStatus === filters.statusFilter;
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      tasks = tasks.filter(
        (task) =>
          task.name?.toLowerCase().includes(query) ||
          task.description?.toLowerCase().includes(query) ||
          task.boardName?.toLowerCase().includes(query)
      );
    }

    return tasks;
  }, [allTasks, filters.selectedBoard, filters.statusFilter, searchQuery]);

  // Get time range based on filter
  const getTimeRange = () => {
    const now = new Date();
    switch (filters.timeView) {
      case 'week': {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        return { start: weekStart, end: weekEnd };
      }
      case 'month': {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { start: monthStart, end: monthEnd };
      }
      case 'year': {
        const yearStart = new Date(now.getFullYear(), 0, 1);
        const yearEnd = new Date(now.getFullYear(), 11, 31);
        return { start: yearStart, end: yearEnd };
      }
    }
  };

  const timeRange = getTimeRange();
  const totalDays = Math.ceil(
    (timeRange.end.getTime() - timeRange.start.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  // Calculate productivity stats
  const productivityStats = useMemo(() => {
    const completed = filteredTasks.filter(
      (task) => task.listStatus === 'done' || task.listStatus === 'closed'
    ).length;
    const total = filteredTasks.length;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    const overdue = filteredTasks.filter(
      (task) =>
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
      overdueTasks: overdue,
    };
  }, [filteredTasks]);

  // Process all tasks for Gantt display (before pagination)
  const allGanttTasks = useMemo(() => {
    return filteredTasks
      .filter((task) => task.created_at) // Only tasks with creation date
      .map((task) => {
        const createdDate = new Date(task.created_at);
        const endDate =
          task.listStatus === 'done' || task.listStatus === 'closed'
            ? task.updated_at
              ? new Date(task.updated_at)
              : createdDate
            : task.end_date
              ? new Date(task.end_date)
              : new Date();

        // Calculate position and width
        const startOffset = Math.max(
          0,
          (createdDate.getTime() - timeRange.start.getTime()) /
            (1000 * 60 * 60 * 24)
        );
        const duration = Math.max(
          1,
          (endDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          ...task,
          createdDate,
          endDate,
          startOffset: (startOffset / totalDays) * 100,
          width: Math.min(
            (duration / totalDays) * 100,
            100 - (startOffset / totalDays) * 100
          ),
          status: task.listStatus || 'not_started',
        };
      })
      .filter((task) => task.startOffset < 100) // Only show tasks within time range
      .sort((a, b) => a.createdDate.getTime() - b.createdDate.getTime());
  }, [filteredTasks, timeRange, totalDays]);

  // Calculate pagination
  const totalTasks = allGanttTasks.length;
  const totalPages = Math.ceil(totalTasks / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  // Get current page tasks
  const ganttTasks = useMemo(() => {
    return allGanttTasks.slice(startIndex, endIndex);
  }, [allGanttTasks, startIndex, endIndex]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters.selectedBoard, filters.statusFilter, searchQuery]);

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
    const markerCount =
      filters.timeView === 'week' ? 7 : filters.timeView === 'month' ? 4 : 12;

    for (let i = 0; i <= markerCount; i++) {
      const position = (i / markerCount) * 100;
      const date = new Date(timeRange.start);

      if (filters.timeView === 'week') {
        date.setDate(date.getDate() + i);
        markers.push({
          position,
          label: date.toLocaleDateString('en', { weekday: 'short' }),
        });
      } else if (filters.timeView === 'month') {
        date.setDate(date.getDate() + i * 7);
        markers.push({ position, label: `Week ${i + 1}` });
      } else {
        date.setMonth(date.getMonth() + i);
        markers.push({
          position,
          label: date.toLocaleDateString('en', { month: 'short' }),
        });
      }
    }
    return markers;
  }, [filters.timeView, timeRange]);

  // Add the click handlers to the GanttChart component
  const handleTaskClick = (e: React.MouseEvent, task: any) => {
    e.stopPropagation();

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    setClickedTask(task);
    setClickCardVisible(true);

    // Position near the click
    let newX = mouseX + 15;
    let newY = mouseY + 15;

    // Ensure it doesn't go off screen
    if (newX + 250 > window.innerWidth) {
      newX = mouseX - 265;
    }
    if (newY + 150 > window.innerHeight) {
      newY = mouseY - 165;
    }

    setClickCardPosition({ x: newX, y: newY });
  };

  const handleCloseClick = () => {
    setClickCardVisible(false);
    setClickedTask(null);
  };

  // Add click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        clickCardRef.current &&
        !clickCardRef.current.contains(event.target as Node)
      ) {
        handleCloseClick();
      }
    };

    const handleScroll = () => {
      handleCloseClick();
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseClick();
      }
    };

    if (clickCardVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true); // Use capture to catch all scroll events
      document.addEventListener('keydown', handleEscape);
      window.addEventListener('scroll', handleScroll);
      // Also listen for scrolling on the gantt container
      const ganttContainer = document.querySelector('.custom-scrollbar');
      if (ganttContainer) {
        ganttContainer.addEventListener('scroll', handleScroll);
      }
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll);
      const ganttContainer = document.querySelector('.custom-scrollbar');
      if (ganttContainer) {
        ganttContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, [clickCardVisible]);

  return (
    <>
      <Card className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h4 className="font-medium">Task Gantt Timeline</h4>
            <p className="text-sm text-muted-foreground">
              Visual timeline showing task lifecycle from creation to completion
            </p>
          </div>

          {/* Productivity Stats */}
          <div className="flex items-center gap-4 text-sm">
            <div className="text-center">
              <div className="font-semibold text-green-600">
                {productivityStats.completionRate}%
              </div>
              <div className="text-muted-foreground">Completion</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-blue-600">
                {productivityStats.onTimeRate}%
              </div>
              <div className="text-muted-foreground">On-Time</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-purple-600">
                {productivityStats.totalTasks}
              </div>
              <div className="text-muted-foreground">Tasks</div>
            </div>
          </div>
        </div>

        {/* Combined Search, Pagination and Task Count Controls */}
        <div className="mb-4 flex flex-col items-center justify-between gap-4 md:flex-row">
          {/* Search Input */}
          <div className="relative w-full md:max-w-sm">
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 focus:outline-none dark:border-gray-700"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Pagination and Task Count */}
          <div className="flex flex-wrap items-center justify-center gap-4 md:justify-end">
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>

            {totalTasks > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>
                  Showing {startIndex + 1}-{Math.min(endIndex, totalTasks)} of{' '}
                  {totalTasks} tasks
                </span>

                {totalPages > 1 && (
                  <div className="ml-4 flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>

                    <span className="px-2 text-sm">
                      {currentPage} of {totalPages}
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }
                      disabled={currentPage === totalPages}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Time Scale - Horizontally Scrollable for Year View */}
        <div className="relative mb-4 h-10">
          <div
            className={cn(
              'relative border-b pb-3',
              filters.timeView === 'year'
                ? 'overflow-x-auto overflow-y-hidden'
                : 'overflow-hidden'
            )}
          >
            <div
              className={cn(
                'relative flex',
                filters.timeView === 'year'
                  ? 'h-6 min-w-[1000px]'
                  : 'h-6 w-full'
              )}
            >
              {timeMarkers.map((marker, index) => (
                <div
                  key={index}
                  className={cn(
                    'flex items-center justify-center text-xs whitespace-nowrap text-muted-foreground',
                    filters.timeView === 'year'
                      ? 'flex-1 px-2 text-center'
                      : 'absolute -translate-x-1/2 transform'
                  )}
                  style={
                    filters.timeView === 'year'
                      ? {}
                      : {
                          left: `${Math.min(Math.max(marker.position, 8), 92)}%`,
                          top: '0px',
                        }
                  }
                >
                  {marker.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Gantt Chart - Fixed Height Container */}
        <div
          className="relative rounded-lg border bg-background"
          style={{ height: '320px' }} // Fixed height instead of expanding
        >
          <style
            dangerouslySetInnerHTML={{
              __html: `
            .custom-scrollbar::-webkit-scrollbar {
              width: 8px;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
              background: transparent;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
              background: #3b82f6;
              border-radius: 4px;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
              background: #2563eb;
            }
            .hover-card {
              position: fixed;
              z-index: 9999;
              pointer-events: none;
              opacity: 0;
              transform: scale(0.95);
              transition: all 0.2s ease-out;
              will-change: transform, opacity, left, top;
            }
            .group:hover .hover-card {
              opacity: 1;
              transform: scale(1);
              pointer-events: auto;
            }
            .hover-card::before {
              content: '';
              position: absolute;
              width: 0;
              height: 0;
              border-style: solid;
              border-width: 5px 5px 5px 0;
              border-color: transparent #ffffff transparent transparent;
              left: -5px;
              top: 12px;
              filter: drop-shadow(-1px 0 1px rgba(0,0,0,0.1));
            }
            .dark .hover-card::before {
              border-color: transparent #111827 transparent transparent;
            }
          `,
            }}
          />

          {/* Scrollable Content Area */}
          <div
            className="custom-scrollbar h-full overflow-y-auto p-4 pr-2"
            style={{
              scrollbarWidth: 'thin',
              scrollbarColor: '#3b82f6 transparent',
            }}
          >
            <div className="space-y-1">
              {ganttTasks.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No tasks found for the selected time period
                </div>
              ) : (
                ganttTasks.map((task) => (
                  <div
                    key={task.id}
                    className="group relative flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    {/* Task Info */}
                    <div className="w-52 min-w-0">
                      {/* Task Name with line clamp */}
                      <div
                        className="line-clamp-1 text-sm font-medium text-gray-900 transition-all duration-200 group-hover:line-clamp-none dark:text-gray-100"
                        title={task.name}
                      >
                        {task.name}
                      </div>
                    </div>

                    {/* Timeline Bar */}
                    <div className="relative h-6 flex-1 rounded bg-gray-100 dark:bg-gray-800">
                      <div
                        className={cn(
                          'absolute h-full cursor-pointer rounded transition-all hover:opacity-90',
                          getStatusColor(task.status)
                        )}
                        style={{
                          left: `${task.startOffset}%`,
                          width: `${task.width}%`,
                        }}
                      >
                        {/* Status Indicators */}
                        <div className="pointer-events-none absolute inset-y-0 flex w-full items-center justify-between">
                          {/* Not Started (Gray) */}
                          <div
                            className="h-2 w-2 rounded-full bg-gray-400 opacity-70"
                            style={{ left: '0%' }}
                          />

                          {/* In Progress (Blue) */}
                          {task.status === 'active' && (
                            <div
                              className="h-2 w-2 rounded-full bg-blue-500 opacity-70"
                              style={{
                                left: '50%',
                                transform: 'translateX(-50%)',
                              }}
                            />
                          )}

                          {/* Completed (Green) */}
                          {(task.status === 'done' ||
                            task.status === 'closed') && (
                            <div
                              className="h-2 w-2 rounded-full bg-green-500 opacity-70"
                              style={{ right: '0%' }}
                            />
                          )}
                        </div>

                        <div className="flex h-full items-center justify-center text-xs font-medium text-white">
                          {(task.status === 'done' ||
                            task.status === 'closed') &&
                          filters.timeView !== 'year' &&
                          task.width > 15
                            ? '✓'
                            : ''}
                        </div>

                        {/* Status transition markers and timeline */}
                        {task.updated_at &&
                          task.updated_at !== task.created_at && (
                            <>
                              {/* Status change marker */}
                              <div
                                className="absolute top-0 h-full w-0.5 bg-yellow-400 opacity-60"
                                style={{ left: '50%' }}
                                title={`Status changed: ${new Date(task.updated_at).toLocaleDateString()}`}
                              />

                              {/* Progress indicator for active tasks */}
                              {task.status === 'active' && (
                                <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                              )}
                            </>
                          )}

                        {/* Task lifecycle phases - Individual phase hover targets */}
                        <div className="absolute inset-0 flex">
                          {/* Creation phase (first 25% of timeline) */}
                          <div
                            className="cursor-help bg-gray-300 opacity-30 transition-opacity hover:opacity-50 dark:bg-gray-600"
                            style={{ width: '25%' }}
                            title={`📅 Created: ${task.createdDate.toLocaleDateString()} at ${task.createdDate.toLocaleTimeString()}`}
                          />

                          {/* Active development phase (middle 50%) */}
                          {task.status === 'active' && (
                            <div
                              className="cursor-help bg-blue-400 opacity-40 transition-opacity hover:opacity-60"
                              style={{ width: '50%' }}
                              title={`🔄 In Progress: Started ${task.createdDate.toLocaleDateString()}${task.updated_at ? ` • Last updated: ${new Date(task.updated_at).toLocaleDateString()}` : ''}`}
                            />
                          )}

                          {/* Completion phase (last 25% if completed) */}
                          {(task.status === 'done' ||
                            task.status === 'closed') && (
                            <div
                              className="ml-auto cursor-help bg-green-400 opacity-40 transition-opacity hover:opacity-60"
                              style={{ width: '25%' }}
                              title={`✅ ${task.status === 'done' ? 'Completed' : 'Closed'}: ${task.updated_at ? new Date(task.updated_at).toLocaleDateString() + ' at ' + new Date(task.updated_at).toLocaleTimeString() : 'Date unknown'}${task.end_date ? ` • Due was: ${new Date(task.end_date).toLocaleDateString()}` : ''}`}
                            />
                          )}

                          {/* Main timeline click area */}
                          <div
                            className="absolute inset-0 cursor-pointer"
                            onClick={(e) => handleTaskClick(e, task)}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div className="w-24 text-xs">
                      <Badge
                        variant="outline"
                        className={cn(
                          'border text-xs font-medium',
                          task.status === 'done' &&
                            'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400',
                          task.status === 'closed' &&
                            'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
                          task.status === 'active' &&
                            'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
                          task.status === 'not_started' &&
                            'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                        )}
                      >
                        {task.status === 'done' ? (
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                            Done
                          </span>
                        ) : task.status === 'closed' ? (
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-purple-500"></span>
                            Closed
                          </span>
                        ) : task.status === 'active' ? (
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500"></span>
                            Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-gray-400"></span>
                            Pending
                          </span>
                        )}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Enhanced Legend - Collapsible */}
        <Collapsible className="mt-4 border-t pt-4">
          <CollapsibleTrigger className="group flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <h5 className="text-sm font-medium">Status Legend</h5>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </div>
            <span className="text-xs text-muted-foreground">
              Hover over tasks for detailed timeline
            </span>
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-3">
            <div className="flex flex-wrap items-center gap-6 text-xs">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-gray-400"></div>
                <span>Not Started</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-blue-500"></div>
                <span>Active</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-green-500"></div>
                <span>Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 w-3 rounded bg-yellow-400"></div>
                <span>Status Change</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 w-3 rounded bg-gradient-to-r from-gray-300 via-blue-400 to-green-400"></div>
                <span>Lifecycle Phases</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 w-3 rounded bg-red-500"></div>
                <span>Overdue</span>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Beautiful Click Card */}
      {clickCardVisible && clickedTask && (
        <>
          {/* Subtle backdrop */}
          <div
            className="fixed inset-0 z-[9998] bg-black/5 backdrop-blur-[1px]"
            onClick={handleCloseClick}
          />

          <div
            ref={clickCardRef}
            className="fixed z-[9999] max-w-sm rounded-lg border border-gray-200 bg-white shadow-xl duration-200 animate-in slide-in-from-bottom-2 dark:border-gray-700 dark:bg-gray-900"
            style={{
              left: Math.max(
                10,
                Math.min(clickCardPosition.x, window.innerWidth - 350)
              ),
              top: Math.max(
                10,
                Math.min(clickCardPosition.y, window.innerHeight - 200)
              ),
            }}
          >
            {/* Compact Header */}
            <div className="rounded-t-lg border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-3 dark:border-gray-800 dark:from-blue-900/20 dark:to-indigo-900/20">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-semibold text-gray-800 dark:text-gray-100">
                    {clickedTask.name}
                  </h4>
                  <div className="mt-1 flex items-center gap-1">
                    <Badge variant="outline" className="px-1 py-0 text-xs">
                      {clickedTask.boardName || 'Unknown Board'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">•</span>
                    <Badge variant="outline" className="px-1 py-0 text-xs">
                      {clickedTask.listName || 'Unknown List'}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs font-medium',
                      clickedTask.status === 'done' &&
                        'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400',
                      clickedTask.status === 'closed' &&
                        'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
                      clickedTask.status === 'active' &&
                        'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
                      clickedTask.status === 'not_started' &&
                        'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                    )}
                  >
                    {clickedTask.status === 'done' ? (
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                        Done
                      </span>
                    ) : clickedTask.status === 'closed' ? (
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-purple-500"></span>
                        Closed
                      </span>
                    ) : clickedTask.status === 'active' ? (
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500"></span>
                        Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-400"></span>
                        Pending
                      </span>
                    )}
                  </Badge>
                  <button
                    onClick={handleCloseClick}
                    className="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Compact Content */}
            <div className="space-y-2 p-3">
              {clickedTask.description && (
                <p className="line-clamp-2 text-xs text-gray-600 dark:text-gray-400">
                  {clickedTask.description}
                </p>
              )}

              {/* Compact Info Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-green-500" />
                    <span className="text-muted-foreground">Created:</span>
                  </div>
                  <div className="pl-4 font-medium">
                    {clickedTask.createdDate
                      ? clickedTask.createdDate.toLocaleDateString()
                      : 'N/A'}
                  </div>

                  {clickedTask.end_date && (
                    <>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-orange-500" />
                        <span className="text-muted-foreground">Due:</span>
                      </div>
                      <div className="pl-4 font-medium">
                        {new Date(clickedTask.end_date).toLocaleDateString()}
                      </div>
                    </>
                  )}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Activity className="h-3 w-3 text-blue-500" />
                    <span className="text-muted-foreground">Duration:</span>
                  </div>
                  <div className="pl-4 font-medium">
                    {(() => {
                      try {
                        if (clickedTask.createdDate && clickedTask.endDate) {
                          const durationMs =
                            clickedTask.endDate.getTime() -
                            clickedTask.createdDate.getTime();
                          const days = Math.ceil(
                            durationMs / (1000 * 60 * 60 * 24)
                          );
                          const hours = Math.ceil(
                            durationMs / (1000 * 60 * 60)
                          );
                          return days === 0 ? `${hours} hrs` : `${days} days`;
                        }
                        return 'N/A';
                      } catch {
                        return 'N/A';
                      }
                    })()}
                  </div>

                  {clickedTask.priority && (
                    <>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Priority:</span>
                      </div>
                      <div className="pl-4">
                        <Badge
                          variant={
                            clickedTask.priority === 1
                              ? 'destructive'
                              : clickedTask.priority === 2
                                ? 'default'
                                : clickedTask.priority === 3
                                  ? 'secondary'
                                  : 'outline'
                          }
                          className="text-xs"
                        >
                          {clickedTask.priority === 1
                            ? '🔥 Urgent'
                            : clickedTask.priority === 2
                              ? '⚡ High'
                              : clickedTask.priority === 3
                                ? '📋 Medium'
                                : '📝 Low'}
                        </Badge>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {clickedTask.assignee_name && (
                <div className="flex items-center gap-2 pt-1">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-xs font-medium text-white">
                    {clickedTask.assignee_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-medium">
                    {clickedTask.assignee_name}
                  </span>
                </div>
              )}

              {/* Compact Progress */}
              <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-600">
                <div
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    clickedTask.status === 'done' ||
                      clickedTask.status === 'closed'
                      ? 'bg-green-500'
                      : clickedTask.status === 'active'
                        ? 'bg-blue-500'
                        : 'bg-gray-400 dark:bg-gray-500'
                  )}
                  style={{
                    width:
                      clickedTask.status === 'done' ||
                      clickedTask.status === 'closed'
                        ? '100%'
                        : clickedTask.status === 'active'
                          ? '60%'
                          : '10%',
                  }}
                />
              </div>

              {/* Compact Overdue Warning */}
              {clickedTask.end_date &&
                new Date(clickedTask.end_date) < new Date() &&
                clickedTask.status !== 'done' &&
                clickedTask.status !== 'closed' && (
                  <div className="flex items-center gap-1 rounded border border-red-200 bg-red-50 p-2 dark:border-red-800 dark:bg-red-900/20">
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                    <span className="text-xs font-medium text-red-600 dark:text-red-400">
                      Overdue by{' '}
                      {Math.ceil(
                        (new Date().getTime() -
                          new Date(clickedTask.end_date).getTime()) /
                          (1000 * 60 * 60 * 24)
                      )}{' '}
                      days
                    </span>
                  </div>
                )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

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

export function EnhancedBoardsView({ data, count }: EnhancedBoardsViewProps) {
  const [selectedBoard, setSelectedBoard] = useState<(typeof data)[0] | null>(
    null
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [taskModal, setTaskModal] = useState<TaskModalState>({
    isOpen: false,
    filterType: 'all',
    selectedBoard: null,
  });

  const [analyticsFilters, setAnalyticsFilters] = useState<AnalyticsFilters>({
    timeView: 'month',
    selectedBoard: null,
    statusFilter: 'all',
  });

  // Calculate aggregate metrics for the quick stats - now responsive to board selection
  const getFilteredMetrics = (selectedBoard: string | null) => {
    const filteredData = selectedBoard
      ? data.filter((board) => board.id === selectedBoard)
      : data;
    const totalTasks = filteredData.reduce(
      (sum, board) => sum + board.totalTasks,
      0
    );
    const totalCompleted = filteredData.reduce(
      (sum, board) => sum + board.completedTasks,
      0
    );
    const totalOverdue = filteredData.reduce(
      (sum, board) => sum + board.overdueTasks,
      0
    );
    const totalHighPriority = filteredData.reduce(
      (sum, board) => sum + board.highPriorityTasks,
      0
    );
    const avgProgress =
      filteredData.length > 0
        ? Math.round(
            filteredData.reduce(
              (sum, board) => sum + board.progressPercentage,
              0
            ) / filteredData.length
          )
        : 0;

    return {
      totalTasks,
      totalCompleted,
      totalOverdue,
      totalHighPriority,
      avgProgress,
    };
  };

  // Default metrics for main dashboard
  const {
    totalTasks,
    totalCompleted,
    totalOverdue,
    totalHighPriority,
    avgProgress,
  } = getFilteredMetrics(null);

  // Analytics-specific metrics that respond to board selection
  const analyticsMetrics = useMemo(
    () => getFilteredMetrics(analyticsFilters.selectedBoard),
    [analyticsFilters.selectedBoard, data]
  );

  // Get all tasks across all boards for filtering
  const allTasks = useMemo(() => {
    return data.flatMap((board) =>
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
  }, [data]);

  // Calculate actual average task completion time
  const calculateAvgDuration = useMemo(() => {
    const filteredTasks = analyticsFilters.selectedBoard
      ? allTasks.filter(
          (task) => task.boardId === analyticsFilters.selectedBoard
        )
      : allTasks;

    const completedTasks = filteredTasks.filter(
      (task) =>
        (task.listStatus === 'done' ||
          task.listStatus === 'closed' ||
          task.archived) &&
        task.created_at &&
        (task as any).updated_at
    );

    if (completedTasks.length === 0) return { days: 0, hours: 0, label: 'N/A' };

    const totalDurationMs = completedTasks.reduce((sum, task) => {
      const createdDate = new Date(task.created_at);
      const completedDate = new Date((task as any).updated_at);
      return sum + (completedDate.getTime() - createdDate.getTime());
    }, 0);

    const avgDurationMs = totalDurationMs / completedTasks.length;
    const avgDays = Math.round(avgDurationMs / (1000 * 60 * 60 * 24));
    const avgHours = Math.round(avgDurationMs / (1000 * 60 * 60));

    // Return appropriate format based on duration
    if (avgDays > 0) {
      return { days: avgDays, hours: 0, label: `${avgDays}d` };
    } else if (avgHours > 0) {
      return { days: 0, hours: avgHours, label: `${avgHours}h` };
    } else {
      return { days: 0, hours: 0, label: '<1h' };
    }
  }, [allTasks, analyticsFilters.selectedBoard]);

  // Calculate task velocity (tasks completed per week)
  const calculateTaskVelocity = useMemo(() => {
    const filteredTasks = analyticsFilters.selectedBoard
      ? allTasks.filter(
          (task) => task.boardId === analyticsFilters.selectedBoard
        )
      : allTasks;

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const thisWeekCompleted = filteredTasks.filter(
      (task) =>
        (task.listStatus === 'done' ||
          task.listStatus === 'closed' ||
          task.archived) &&
        (task as any).updated_at &&
        new Date((task as any).updated_at) >= oneWeekAgo
    ).length;

    const lastWeekCompleted = filteredTasks.filter(
      (task) =>
        (task.listStatus === 'done' ||
          task.listStatus === 'closed' ||
          task.archived) &&
        (task as any).updated_at &&
        new Date((task as any).updated_at) >= twoWeeksAgo &&
        new Date((task as any).updated_at) < oneWeekAgo
    ).length;

    const trend =
      lastWeekCompleted > 0
        ? ((thisWeekCompleted - lastWeekCompleted) / lastWeekCompleted) * 100
        : thisWeekCompleted > 0
          ? 100
          : 0;

    return {
      thisWeek: thisWeekCompleted,
      lastWeek: lastWeekCompleted,
      trend: Math.round(trend),
      label: `${thisWeekCompleted}/week`,
    };
  }, [allTasks, analyticsFilters.selectedBoard]);

  // Calculate on-time delivery rate
  const calculateOnTimeRate = useMemo(() => {
    const filteredTasks = analyticsFilters.selectedBoard
      ? allTasks.filter(
          (task) => task.boardId === analyticsFilters.selectedBoard
        )
      : allTasks;

    const completedWithDueDate = filteredTasks.filter(
      (task) =>
        (task.listStatus === 'done' ||
          task.listStatus === 'closed' ||
          task.archived) &&
        task.end_date &&
        (task as any).updated_at
    );

    if (completedWithDueDate.length === 0)
      return { rate: 0, onTime: 0, total: 0, label: 'N/A' };

    const onTimeCompleted = completedWithDueDate.filter(
      (task) => new Date((task as any).updated_at) <= new Date(task.end_date!)
    ).length;

    const rate = Math.round(
      (onTimeCompleted / completedWithDueDate.length) * 100
    );

    return {
      rate,
      onTime: onTimeCompleted,
      total: completedWithDueDate.length,
      label: `${rate}%`,
    };
  }, [allTasks, analyticsFilters.selectedBoard]);

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

  const handleBoardClick = (board: (typeof data)[0], e: React.MouseEvent) => {
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

  const handleTaskClick = (task: (typeof filteredTasks)[0]) => {
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
              <TabsContent
                value="cards"
                className="m-0 data-[state=inactive]:hidden"
              >
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
              <TabsContent
                value="analytics"
                className="m-0 data-[state=inactive]:hidden"
              >
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
              {data.length === 0 && (
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
                      Visual timeline and performance metrics for task
                      management
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
                        {data.map((board) => (
                          <SelectItem key={board.id} value={board.id}>
                            {board.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                      Overall completion
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
                    <p className="text-xs text-muted-foreground">In progress</p>
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
                      {(() => {
                        const filteredTasks = analyticsFilters.selectedBoard
                          ? allTasks.filter(
                              (task) =>
                                task.boardId === analyticsFilters.selectedBoard
                            )
                          : allTasks;
                        const completedCount = filteredTasks.filter(
                          (task) =>
                            (task.listStatus === 'done' ||
                              task.listStatus === 'closed' ||
                              task.archived) &&
                            task.created_at &&
                            (task as any).updated_at
                        ).length;
                        return completedCount > 0
                          ? `Based on ${completedCount} completed tasks`
                          : 'No completed tasks yet';
                      })()}
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
                      {calculateTaskVelocity.trend > 0
                        ? '↗️'
                        : calculateTaskVelocity.trend < 0
                          ? '↘️'
                          : '→'}
                      {calculateTaskVelocity.trend !== 0
                        ? ` ${Math.abs(calculateTaskVelocity.trend)}%`
                        : ' No change'}{' '}
                      from last week
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
                      {calculateOnTimeRate.total > 0
                        ? `${calculateOnTimeRate.onTime}/${calculateOnTimeRate.total} tasks delivered on time`
                        : 'No tasks with due dates yet'}
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
                    {selectedBoard.name}
                  </h3>

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
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-medium">Overall Progress</h4>
                    <span className="text-2xl font-bold text-primary">
                      {selectedBoard.progressPercentage}%
                    </span>
                  </div>
                  <div className="mb-3 h-3 w-full rounded-full bg-muted">
                    <div
                      className="h-3 rounded-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500"
                      style={{ width: `${selectedBoard.progressPercentage}%` }}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {selectedBoard.completedTasks} of {selectedBoard.totalTasks}{' '}
                    tasks completed
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
                        {selectedBoard.totalTasks}
                      </p>
                    </div>

                    <div className="rounded-lg border p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">Completed</span>
                      </div>
                      <p className="text-2xl font-bold">
                        {selectedBoard.completedTasks}
                      </p>
                    </div>

                    <div className="rounded-lg border p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <Activity className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Active</span>
                      </div>
                      <p className="text-2xl font-bold">
                        {selectedBoard.activeTasks}
                      </p>
                    </div>

                    <div className="rounded-lg border p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <Clock className="h-4 w-4 text-red-500" />
                        <span className="text-sm font-medium">Overdue</span>
                      </div>
                      <p className="text-2xl font-bold">
                        {selectedBoard.overdueTasks}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Priority Breakdown */}
                {(selectedBoard.highPriorityTasks > 0 ||
                  selectedBoard.mediumPriorityTasks > 0 ||
                  selectedBoard.lowPriorityTasks > 0) && (
                  <div className="space-y-3">
                    <h4 className="font-medium">Priority Breakdown</h4>

                    <div className="space-y-2">
                      {selectedBoard.highPriorityTasks > 0 && (
                        <div className="flex items-center justify-between rounded-lg bg-red-50 p-2 dark:bg-red-950/20">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            <span className="text-sm font-medium">
                              High Priority
                            </span>
                          </div>
                          <span className="font-bold">
                            {selectedBoard.highPriorityTasks}
                          </span>
                        </div>
                      )}

                      {selectedBoard.mediumPriorityTasks > 0 && (
                        <div className="flex items-center justify-between rounded-lg bg-orange-50 p-2 dark:bg-orange-950/20">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-orange-500" />
                            <span className="text-sm font-medium">
                              Medium Priority
                            </span>
                          </div>
                          <span className="font-bold">
                            {selectedBoard.mediumPriorityTasks}
                          </span>
                        </div>
                      )}

                      {selectedBoard.lowPriorityTasks > 0 && (
                        <div className="flex items-center justify-between rounded-lg bg-green-50 p-2 dark:bg-green-950/20">
                          <div className="flex items-center gap-2">
                            <Target className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium">
                              Low Priority
                            </span>
                          </div>
                          <span className="font-bold">
                            {selectedBoard.lowPriorityTasks}
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
                        {new Date(
                          selectedBoard.created_at
                        ).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span
                        className={
                          selectedBoard.archived
                            ? 'text-muted-foreground'
                            : 'text-green-600'
                        }
                      >
                        {selectedBoard.archived ? 'Archived' : 'Active'}
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
                    onClick={() => (window.location.href = selectedBoard.href)}
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
        <DialogContent className="flex h-[80vh] max-w-4xl flex-col p-0">
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
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Select
                    value={taskModal.selectedBoard || 'all'}
                    onValueChange={(value) =>
                      setTaskModal((prev) => ({
                        ...prev,
                        selectedBoard: value === 'all' ? null : value,
                      }))
                    }
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Filter by board" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Boards</SelectItem>
                      {data.map((board) => (
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
          className="h-auto w-full justify-between p-3 hover:bg-muted/50"
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
            className="group cursor-pointer p-3 transition-colors hover:bg-muted/50"
            onClick={() => onTaskClick(task)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <h4 className="truncate text-sm font-medium">{task.name}</h4>
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
                  <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">
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
                className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
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

// Status Distribution Component
function StatusDistribution({
  allTasks,
  selectedBoard,
}: {
  allTasks: any[];
  selectedBoard: string | null;
}) {
  const filteredTasks = useMemo(() => {
    if (!selectedBoard) return allTasks;
    return allTasks.filter((task) => task.boardId === selectedBoard);
  }, [allTasks, selectedBoard]);

  const statusCounts = useMemo(() => {
    const counts = {
      not_started: 0,
      active: 0,
      done: 0,
      closed: 0,
    };

    filteredTasks.forEach((task) => {
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

  const total = Object.values(statusCounts).reduce(
    (sum, count) => sum + count,
    0
  );

  const statusConfig = [
    {
      key: 'not_started',
      label: 'Not Started',
      color: 'bg-gray-400',
      percentage: total > 0 ? (statusCounts.not_started / total) * 100 : 0,
    },
    {
      key: 'active',
      label: 'Active',
      color: 'bg-blue-500',
      percentage: total > 0 ? (statusCounts.active / total) * 100 : 0,
    },
    {
      key: 'done',
      label: 'Done',
      color: 'bg-green-500',
      percentage: total > 0 ? (statusCounts.done / total) * 100 : 0,
    },
    {
      key: 'closed',
      label: 'Closed',
      color: 'bg-purple-500',
      percentage: total > 0 ? (statusCounts.closed / total) * 100 : 0,
    },
  ];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-medium">Status Distribution</h4>
        <span className="text-xs text-muted-foreground">{total} tasks</span>
      </div>
      <div className="space-y-3">
        {statusConfig.map((status) => (
          <div key={status.key} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn('h-3 w-3 rounded', status.color)}></div>
                <span className="text-sm">{status.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {statusCounts[status.key as keyof typeof statusCounts]}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({status.percentage.toFixed(0)}%)
                </span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  status.color
                )}
                style={{ width: `${status.percentage}%` }}
              />
            </div>
          </div>
        ))}
        {total === 0 && (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No tasks found
          </div>
        )}
      </div>
    </Card>
  );
}

// Priority Distribution Component
function PriorityDistribution({
  allTasks,
  selectedBoard,
}: {
  allTasks: any[];
  selectedBoard: string | null;
}) {
  const filteredTasks = useMemo(() => {
    if (!selectedBoard) return allTasks;
    return allTasks.filter((task) => task.boardId === selectedBoard);
  }, [allTasks, selectedBoard]);

  const priorityCounts = useMemo(() => {
    const counts = {
      URGENT: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
      UNASSIGNED: 0,
    };

    filteredTasks.forEach((task) => {
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

  const total = Object.values(priorityCounts).reduce(
    (sum, count) => sum + count,
    0
  );

  const priorityConfig = [
    {
      key: 'URGENT',
      label: 'Urgent',
      color: 'bg-red-500',
      percentage: total > 0 ? (priorityCounts.URGENT / total) * 100 : 0,
    },
    {
      key: 'HIGH',
      label: 'High',
      color: 'bg-orange-500',
      percentage: total > 0 ? (priorityCounts.HIGH / total) * 100 : 0,
    },
    {
      key: 'MEDIUM',
      label: 'Medium',
      color: 'bg-yellow-500',
      percentage: total > 0 ? (priorityCounts.MEDIUM / total) * 100 : 0,
    },
    {
      key: 'LOW',
      label: 'Low',
      color: 'bg-green-500',
      percentage: total > 0 ? (priorityCounts.LOW / total) * 100 : 0,
    },
    {
      key: 'UNASSIGNED',
      label: 'No Priority Set',
      color: 'bg-gray-300 dark:bg-gray-600',
      percentage: total > 0 ? (priorityCounts.UNASSIGNED / total) * 100 : 0,
    },
  ];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-medium">Priority Distribution</h4>
        <span className="text-xs text-muted-foreground">{total} tasks</span>
      </div>
      <div className="space-y-3">
        {priorityConfig.map((priority) => (
          <div key={priority.key} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn('h-3 w-3 rounded', priority.color)}></div>
                <span className="text-sm">{priority.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {priorityCounts[priority.key as keyof typeof priorityCounts]}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({priority.percentage.toFixed(0)}%)
                </span>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  priority.color
                )}
                style={{ width: `${priority.percentage}%` }}
              />
            </div>
          </div>
        ))}
        {total === 0 && (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No tasks found
          </div>
        )}
      </div>
    </Card>
  );
}

// Enhanced Team Performance & Productivity Component
function AssigneeTimeline({
  allTasks,
  selectedBoard,
}: {
  allTasks: any[];
  selectedBoard: string | null;
}) {
  const filteredTasks = useMemo(() => {
    if (!selectedBoard) return allTasks;
    return allTasks.filter((task) => task.boardId === selectedBoard);
  }, [allTasks, selectedBoard]);

  const assigneeStats = useMemo(() => {
    const stats: {
      [key: string]: {
        total: number;
        completed: number;
        active: number;
        overdue: number;
        notStarted: number;
        avgCompletionTime: number;
        name: string;
        recentActivity: number;
      };
    } = {};

    filteredTasks.forEach((task) => {
      const assigneeId = task.assignee_id || 'unassigned';
      const assigneeName = task.assignee_name || 'Unassigned';

      if (!stats[assigneeId]) {
        stats[assigneeId] = {
          total: 0,
          completed: 0,
          active: 0,
          overdue: 0,
          notStarted: 0,
          avgCompletionTime: 0,
          name: assigneeName,
          recentActivity: 0,
        };
      }

      stats[assigneeId].total += 1;

      if (
        task.listStatus === 'done' ||
        task.listStatus === 'closed' ||
        task.archived
      ) {
        stats[assigneeId].completed += 1;

        // Calculate completion time if we have dates
        if (task.created_at && task.updated_at) {
          const completionTime =
            new Date(task.updated_at).getTime() -
            new Date(task.created_at).getTime();
          const days = completionTime / (1000 * 60 * 60 * 24);
          stats[assigneeId].avgCompletionTime =
            (stats[assigneeId].avgCompletionTime + days) / 2;
        }
      } else if (task.listStatus === 'active') {
        stats[assigneeId].active += 1;
      } else {
        stats[assigneeId].notStarted += 1;
      }

      // Check if overdue
      if (
        task.end_date &&
        new Date(task.end_date) < new Date() &&
        task.listStatus !== 'done' &&
        task.listStatus !== 'closed' &&
        !task.archived
      ) {
        stats[assigneeId].overdue += 1;
      }

      // Recent activity (tasks updated in last 7 days)
      if (
        task.updated_at &&
        new Date(task.updated_at) >
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ) {
        stats[assigneeId].recentActivity += 1;
      }
    });

    return Object.entries(stats)
      .map(([id, data]) => ({
        id,
        ...data,
        completionRate:
          data.total > 0 ? (data.completed / data.total) * 100 : 0,
        efficiency:
          data.completed > 0
            ? Math.max(0, 100 - (data.overdue / data.completed) * 100)
            : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredTasks]);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-medium">Team Performance</h4>
        <span className="text-xs text-muted-foreground">
          {assigneeStats.length} members
        </span>
      </div>
      <div className="max-h-64 space-y-3 overflow-y-auto">
        {assigneeStats.map((assignee) => (
          <div
            key={assignee.id}
            className="space-y-2 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-purple-500 text-xs font-medium text-white">
                  {assignee.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium">{assignee.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {assignee.total} tasks •{' '}
                    {assignee.completionRate.toFixed(0)}% completion
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-green-600">
                  {assignee.completed}
                </div>
                <div className="text-xs text-muted-foreground">completed</div>
              </div>
            </div>

            {/* Progress bars */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>Progress</span>
                <span>{assignee.completionRate.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-600">
                <div
                  className="h-1.5 rounded-full bg-green-500 transition-all"
                  style={{ width: `${assignee.completionRate}%` }}
                />
              </div>
            </div>

            {/* Task breakdown */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center">
                <div className="font-medium text-blue-600">
                  {assignee.active}
                </div>
                <div className="text-muted-foreground">Active</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-red-600">
                  {assignee.overdue}
                </div>
                <div className="text-muted-foreground">Overdue</div>
              </div>
              <div className="text-center">
                <div className="font-medium text-purple-600">
                  {assignee.recentActivity}
                </div>
                <div className="text-muted-foreground">Recent</div>
              </div>
            </div>
          </div>
        ))}
        {assigneeStats.length === 0 && (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No team members found
          </div>
        )}
      </div>
    </Card>
  );
}
