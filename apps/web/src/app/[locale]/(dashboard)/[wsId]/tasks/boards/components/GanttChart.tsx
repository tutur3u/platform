'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Target,
  TrendingUp,
  X,
} from '@tuturuuu/ui/icons';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { getStatusColor, getTaskCompletionDate } from '../utils/taskHelpers';

interface AnalyticsFilters {
  timeView: 'week' | 'month' | 'year';
  selectedBoard: string | null;
  statusFilter: 'all' | 'not_started' | 'active' | 'done' | 'closed';
}

interface GanttChartProps {
  allTasks: any[];
  filters: AnalyticsFilters;
}

export function GanttChart({ allTasks, filters }: GanttChartProps) {
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

  // Generate time markers - Move this before useEffect
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

  // Get current page tasks
  const ganttTasks = useMemo(() => {
    return allGanttTasks.slice(startIndex, endIndex);
  }, [allGanttTasks, startIndex, endIndex]);

  // Calculate task duration for the clicked task - moved to top level to avoid hook order issues
  const clickedTaskDuration = useMemo(() => {
    if (!clickedTask) return 'N/A';
    
    try {
      const createdDate = clickedTask.created_at ? new Date(clickedTask.created_at) : null;
      
      if (!createdDate || isNaN(createdDate.getTime())) {
        return 'N/A';
      }

      // For completed tasks, calculate actual duration
      if (clickedTask.status === 'done' || clickedTask.status === 'closed') {
        const completionDate = getTaskCompletionDate(clickedTask);
        if (completionDate && !isNaN(completionDate.getTime())) {
          const durationMs = completionDate.getTime() - createdDate.getTime();
          const days = Math.floor(durationMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor(durationMs / (1000 * 60 * 60));
          
          if (days >= 1) {
            return `${days} day${days !== 1 ? 's' : ''}`;
          } else if (hours >= 1) {
            return `${hours} hr${hours !== 1 ? 's' : ''}`;
          } else {
            return '<1 hr';
          }
        }
      }
      
      // For non-completed tasks, show planned duration or time elapsed
      if (clickedTask.end_date) {
        const dueDate = new Date(clickedTask.end_date);
        if (!isNaN(dueDate.getTime())) {
          const plannedDurationMs = dueDate.getTime() - createdDate.getTime();
          const days = Math.floor(plannedDurationMs / (1000 * 60 * 60 * 24));
          const hours = Math.floor(plannedDurationMs / (1000 * 60 * 60));
          
          if (days >= 1) {
            return `${days} day${days !== 1 ? 's' : ''} (planned)`;
          } else if (hours >= 1) {
            return `${hours} hr${hours !== 1 ? 's' : ''} (planned)`;
          } else {
            return '<1 hr (planned)';
          }
        }
      }
      
      // Fallback: show time elapsed since creation
      const now = new Date();
      const elapsedMs = now.getTime() - createdDate.getTime();
      const days = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
      
      if (days >= 1) {
        return `${days} day${days !== 1 ? 's' : ''} (elapsed)`;
      } else if (hours >= 1) {
        return `${hours} hr${hours !== 1 ? 's' : ''} (elapsed)`;
      } else {
        return '<1 hr (elapsed)';
      }
    } catch (error) {
      return 'N/A';
    }
  }, [clickedTask]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters.selectedBoard, filters.statusFilter, searchQuery]);

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
                    {clickedTaskDuration}
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