'use client';

import { useCurrentUser } from '../hooks/use-current-user';
import type { ExtendedWorkspaceTask, TaskSidebarFilters } from '../types';
import {
  generateAssigneeInitials,
  getFilteredAndSortedSidebarTasks,
  useTaskCounts,
} from '../utils';
import { Button } from '@tuturuuu/ui/button';
import { CheckCircle, Clock, MapPin, RefreshCw, Tag } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

interface TasksContentProps {
  wsId?: string;
}

export function TasksContent({ wsId: propWsId }: TasksContentProps) {
  const { userId: currentUserId, isLoading: isLoadingUser } = useCurrentUser();
  const params = useParams();
  const wsId = propWsId || (params.wsId as string);

  const [tasks, setTasks] = useState<ExtendedWorkspaceTask[]>([]);

  // Enhanced loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [retryCount, setRetryCount] = useState(0);
  const isMountedRef = useRef(true);

  // Drag and drop state for highlighting drop zones
  const [isDraggingTask, setIsDraggingTask] = useState(false);

  // Tasks sidebar search and filter state with persistence
  const [tasksSidebarSearch, setTasksSidebarSearch] = useState('');
  const [tasksSidebarFilters, setTasksSidebarFilters] =
    useState<TaskSidebarFilters>(() => {
      if (typeof window !== 'undefined') {
        const saved = localStorage.getItem(`time-tracker-filters-${wsId}`);
        if (saved) {
          try {
            return {
              board: 'all',
              list: 'all',
              assignee: 'all',
              ...JSON.parse(saved),
            };
          } catch {
            return { board: 'all', list: 'all', assignee: 'all' };
          }
        }
      }
      return { board: 'all', list: 'all', assignee: 'all' };
    });

  // Save filters to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        `time-tracker-filters-${wsId}`,
        JSON.stringify(tasksSidebarFilters)
      );
    }
  }, [tasksSidebarFilters, wsId]);

  // Use memoized task counts
  const { myTasksCount, unassignedCount } = useTaskCounts(tasks);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // API call helper with enhanced error handling and retry logic
  const apiCall = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const controller = new AbortController();

      try {
        const response = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
          signal: controller.signal,
          ...options,
        });

        if (!response.ok) {
          const error = await response
            .json()
            .catch(() => ({ error: 'Unknown error' }));
          throw new Error(error.error || `HTTP ${response.status}`);
        }

        setIsOffline(false);
        setRetryCount(0);
        return response.json();
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw err;
        }

        const isNetworkError =
          err instanceof TypeError && err.message.includes('fetch');
        if (isNetworkError) {
          setIsOffline(true);
        }

        const message = err instanceof Error ? err.message : 'Network error';
        console.error('API call failed:', message);
        throw new Error(message);
      }
    },
    []
  );

  // Fetch all data with enhanced error handling and exponential backoff
  const fetchData = useCallback(
    async (showLoading = true, isRetry = false) => {
      if (!currentUserId || !isMountedRef.current) return;

      if (showLoading && !isRetry) setIsLoading(true);
      setError(null);

      try {
        // Individual API calls with error handling for each
        const apiCalls = [
          {
            name: 'categories',
            call: () =>
              apiCall(`/api/v1/workspaces/${wsId}/time-tracking/categories`),
            fallback: { categories: [] },
          },
          {
            name: 'tasks',
            call: () => apiCall(`/api/v1/workspaces/${wsId}/tasks?limit=100`),
            fallback: { tasks: [] },
          },
        ];

        // Execute API calls with individual error handling
        const results = await Promise.allSettled(
          apiCalls.map(({ call }) => call())
        );

        // Process results with fallbacks for failed calls
        const [, tasksRes] = results.map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            const { name, fallback } = apiCalls[index] ?? {
              name: 'unknown',
              fallback: {},
            };
            console.warn(`API call for ${name} failed:`, result.reason);
            toast.error(
              `Failed to load ${name}: ${result.reason.message || 'Unknown error'}`
            );
            return fallback;
          }
        });

        if (!isMountedRef.current) return;

        setTasks(tasksRes.tasks || []);

        setLastRefresh(new Date());
        setRetryCount(0);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        const message =
          error instanceof Error ? error.message : 'Failed to load data';
        console.error('Error fetching tasks data:', error);

        if (isMountedRef.current) {
          setError(message);
          setRetryCount((prev) => prev + 1);

          if (!isRetry) {
            toast.error(`Failed to load tasks data: ${message}`);
          }
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [currentUserId, wsId, apiCall]
  );

  // Load data on mount
  useEffect(() => {
    if (currentUserId && wsId) {
      fetchData();
    }
  }, [currentUserId, wsId, fetchData]);

  // Retry function with exponential backoff
  const handleRetry = useCallback(() => {
    fetchData(true, true);
  }, [fetchData]);

  if (isLoadingUser || !currentUserId) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <p className="animate-pulse text-sm text-muted-foreground">
            Loading tasks...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'space-y-6 duration-500 animate-in fade-in-50',
        isLoading && 'opacity-50'
      )}
    >
      {/* Enhanced Header with Quick Stats */}
      <div className="space-y-6">
        {/* Main Header Section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
                <CheckCircle className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Task Workspace
                </h1>
                <p className="text-sm text-muted-foreground sm:text-base">
                  Drag tasks to timer to start tracking 🎯
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                <span>My Tasks: {myTasksCount}</span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                <span>Unassigned: {unassignedCount}</span>
              </div>
            </div>

            {lastRefresh && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>Last updated: {lastRefresh.toLocaleTimeString()}</span>
                {isOffline && (
                  <div className="flex items-center gap-1 text-amber-600">
                    <span>Offline</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(true, false)}
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw
                className={cn('h-4 w-4', isLoading && 'animate-spin')}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <span className="text-red-700 dark:text-red-300">{error}</span>
                {retryCount > 0 && (
                  <p className="mt-1 text-xs opacity-75">
                    Retried {retryCount} time{retryCount > 1 ? 's' : ''}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                disabled={isLoading}
                className="ml-4 flex-shrink-0"
              >
                {isLoading ? 'Retrying...' : 'Try Again'}
              </Button>
            </div>
          </div>
        )}

        {/* Main Tasks Content */}
        <div className="rounded-xl border bg-gradient-to-br from-white to-gray-50/30 p-6 shadow-sm dark:border-gray-800/60 dark:bg-gray-950/50 dark:from-gray-950/80 dark:to-gray-900/60">
          {/* Enhanced Search and Filter Bar */}
          <div className="mb-5 space-y-4">
            {/* Quick Filter Buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setTasksSidebarFilters((prev) => ({
                    ...prev,
                    assignee: prev.assignee === 'mine' ? 'all' : 'mine',
                  }))
                }
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                  tasksSidebarFilters.assignee === 'mine'
                    ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-800'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <CheckCircle className="h-3 w-3" />
                My Tasks
                {myTasksCount > 0 && (
                  <span className="ml-1 rounded-full bg-current px-1.5 py-0.5 text-[10px] text-white">
                    {myTasksCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() =>
                  setTasksSidebarFilters((prev) => ({
                    ...prev,
                    assignee:
                      prev.assignee === 'unassigned' ? 'all' : 'unassigned',
                  }))
                }
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                  tasksSidebarFilters.assignee === 'unassigned'
                    ? 'bg-orange-100 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:ring-orange-800'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <title>User icon</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                Unassigned
                {unassignedCount > 0 && (
                  <span className="ml-1 rounded-full bg-current px-1.5 py-0.5 text-[10px] text-white">
                    {unassignedCount}
                  </span>
                )}
              </button>
            </div>

            {/* Search and Dropdown Filters */}
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Search tasks..."
                  value={tasksSidebarSearch}
                  onChange={(e) => setTasksSidebarSearch(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <Select
                value={tasksSidebarFilters.board}
                onValueChange={(value) =>
                  setTasksSidebarFilters((prev) => ({
                    ...prev,
                    board: value,
                  }))
                }
              >
                <SelectTrigger className="h-8 w-24 text-xs">
                  <SelectValue placeholder="Board" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Boards</SelectItem>
                  {[
                    ...new Set(
                      tasks
                        .map((task) => task.board_name)
                        .filter((name): name is string => Boolean(name))
                    ),
                  ].map((board) => (
                    <SelectItem key={board} value={board}>
                      {board}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={tasksSidebarFilters.list}
                onValueChange={(value) =>
                  setTasksSidebarFilters((prev) => ({
                    ...prev,
                    list: value,
                  }))
                }
              >
                <SelectTrigger className="h-8 w-20 text-xs">
                  <SelectValue placeholder="List" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Lists</SelectItem>
                  {[
                    ...new Set(
                      tasks
                        .map((task) => task.list_name)
                        .filter((name): name is string => Boolean(name))
                    ),
                  ].map((list) => (
                    <SelectItem key={list} value={list}>
                      {list}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Active Filters Display */}
            {(tasksSidebarSearch ||
              tasksSidebarFilters.board !== 'all' ||
              tasksSidebarFilters.list !== 'all' ||
              tasksSidebarFilters.assignee !== 'all') && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Active filters:
                </span>
                {tasksSidebarSearch && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-1 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    Search: &quot;{tasksSidebarSearch}&quot;
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setTasksSidebarSearch('')}
                      className="h-auto p-0 text-xs hover:text-blue-900 dark:hover:text-blue-100"
                    >
                      ×
                    </Button>
                  </span>
                )}
                {tasksSidebarFilters.board !== 'all' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">
                    Board: {tasksSidebarFilters.board}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setTasksSidebarFilters((prev) => ({
                          ...prev,
                          board: 'all',
                        }))
                      }
                      className="h-auto p-0 text-xs hover:text-green-900 dark:hover:text-green-100"
                    >
                      ×
                    </Button>
                  </span>
                )}
                {tasksSidebarFilters.list !== 'all' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-purple-100 px-2 py-1 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                    List: {tasksSidebarFilters.list}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setTasksSidebarFilters((prev) => ({
                          ...prev,
                          list: 'all',
                        }))
                      }
                      className="h-auto p-0 text-xs hover:text-purple-900 dark:hover:text-purple-100"
                    >
                      ×
                    </Button>
                  </span>
                )}
                {tasksSidebarFilters.assignee !== 'all' && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-orange-100 px-2 py-1 text-xs text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                    {tasksSidebarFilters.assignee === 'mine'
                      ? 'My Tasks'
                      : tasksSidebarFilters.assignee === 'unassigned'
                        ? 'Unassigned'
                        : 'Assignee Filter'}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setTasksSidebarFilters((prev) => ({
                          ...prev,
                          assignee: 'all',
                        }))
                      }
                      className="h-auto p-0 text-xs hover:text-purple-900 dark:hover:text-purple-100"
                    >
                      ×
                    </Button>
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTasksSidebarSearch('');
                    setTasksSidebarFilters({
                      board: 'all',
                      list: 'all',
                      assignee: 'all',
                    });
                  }}
                  className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear all
                </Button>
              </div>
            )}
          </div>

          {/* Task List with Scrollable Container */}
          <div className="space-y-4">
            {(() => {
              // Filter and sort tasks for sidebar with user prioritization
              const filteredSidebarTasks = getFilteredAndSortedSidebarTasks(
                tasks,
                tasksSidebarSearch,
                tasksSidebarFilters
              );

              if (tasks.length === 0) {
                return (
                  <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center">
                    <CheckCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No tasks available. Create tasks in your project boards to
                      see them here.
                    </p>
                  </div>
                );
              }

              if (filteredSidebarTasks.length === 0) {
                return (
                  <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center">
                    <CheckCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      No tasks found matching your criteria.
                    </p>
                  </div>
                );
              }

              return (
                <>
                  {/* Task Count Header */}
                  <div className="mb-3 flex items-center justify-between px-1 text-xs text-muted-foreground">
                    <span>
                      {filteredSidebarTasks.length} task
                      {filteredSidebarTasks.length !== 1 ? 's' : ''} available
                      {(tasksSidebarSearch ||
                        tasksSidebarFilters.board !== 'all' ||
                        tasksSidebarFilters.list !== 'all' ||
                        tasksSidebarFilters.assignee !== 'all') &&
                        ` (filtered from ${tasks.length} total)`}
                    </span>
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      Drag to timer →
                    </span>
                  </div>

                  {/* Scrollable Task Container */}
                  <div className="max-h-[600px] overflow-y-auto rounded-lg border bg-gray-50/30 p-4 dark:border-gray-700/40 dark:bg-gray-800/20">
                    <div className="space-y-4">
                      {filteredSidebarTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          className={cn(
                            'group w-full cursor-grab rounded-lg border p-4 text-left shadow-sm transition-all duration-200 hover:scale-[1.01] hover:shadow-md active:cursor-grabbing',
                            // Enhanced styling for assigned tasks
                            task.is_assigned_to_current_user
                              ? 'border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100 ring-1 ring-blue-200 dark:border-blue-700 dark:from-blue-950/30 dark:to-blue-900/30 dark:ring-blue-800'
                              : 'border-gray-200/60 bg-white dark:border-gray-700/60 dark:bg-gray-800/80',
                            isDraggingTask &&
                              'shadow-md ring-1 shadow-blue-500/10 ring-blue-400/30'
                          )}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(
                              'application/json',
                              JSON.stringify({
                                type: 'task',
                                task: task,
                              })
                            );
                            setIsDraggingTask(true);
                          }}
                          onDragEnd={() => {
                            setIsDraggingTask(false);
                          }}
                        >
                          <div className="flex items-start gap-4">
                            <div
                              className={cn(
                                'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border',
                                task.is_assigned_to_current_user
                                  ? 'border-blue-300 bg-gradient-to-br from-blue-100 to-blue-200 dark:border-blue-600 dark:from-blue-800 dark:to-blue-700'
                                  : 'border-blue-200/60 bg-gradient-to-br from-blue-50 to-blue-100 dark:border-blue-700/60 dark:from-blue-900/50 dark:to-blue-800/50'
                              )}
                            >
                              <CheckCircle
                                className={cn(
                                  'h-4 w-4',
                                  task.is_assigned_to_current_user
                                    ? 'text-blue-700 dark:text-blue-300'
                                    : 'text-blue-600 dark:text-blue-400'
                                )}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <h4
                                  className={cn(
                                    'mb-1 text-sm font-medium',
                                    task.is_assigned_to_current_user
                                      ? 'text-blue-900 dark:text-blue-100'
                                      : 'text-gray-900 dark:text-gray-100'
                                  )}
                                >
                                  {task.name}
                                  {task.is_assigned_to_current_user && (
                                    <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
                                      Assigned to you
                                    </span>
                                  )}
                                </h4>
                              </div>
                              {task.description && (
                                <p className="mb-3 line-clamp-2 text-xs text-gray-600 dark:text-gray-400">
                                  {task.description}
                                </p>
                              )}

                              {/* Assignees Display */}
                              {task.assignees && task.assignees.length > 0 && (
                                <div className="mb-2 flex items-center gap-2">
                                  <div className="flex -space-x-1">
                                    {task.assignees
                                      .slice(0, 3)
                                      .map((assignee) => (
                                        <div
                                          key={assignee.id}
                                          className="h-5 w-5 rounded-full border-2 border-white bg-gradient-to-br from-gray-100 to-gray-200 dark:border-gray-800 dark:from-gray-700 dark:to-gray-600"
                                          title={
                                            assignee.display_name ||
                                            assignee.email
                                          }
                                        >
                                          {assignee.avatar_url ? (
                                            <Image
                                              src={assignee.avatar_url}
                                              alt={
                                                assignee.display_name ||
                                                assignee.email ||
                                                'User avatar'
                                              }
                                              width={20}
                                              height={20}
                                              className="h-full w-full rounded-full object-cover"
                                            />
                                          ) : (
                                            <div className="flex h-full w-full items-center justify-center text-[8px] font-medium text-gray-600 dark:text-gray-300">
                                              {generateAssigneeInitials(
                                                assignee
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    {task.assignees.length > 3 && (
                                      <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-gray-200 text-[8px] font-medium text-gray-600 dark:border-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                        +{task.assignees.length - 3}
                                      </div>
                                    )}
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {task.assignees.length} assigned
                                  </span>
                                </div>
                              )}

                              {task.board_name && task.list_name && (
                                <div className="flex items-center gap-2">
                                  <div className="flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 dark:bg-gray-700">
                                    <MapPin className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                      {task.board_name}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 dark:bg-blue-900/30">
                                    <Tag className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                    <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                                      {task.list_name}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-shrink-0 items-center gap-1.5 text-xs text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
                              <span className="font-medium">Drag</span>
                              <svg
                                className="h-3.5 w-3.5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                              >
                                <title>Drag indicator</title>
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M8 9l4-4 4 4m0 6l-4 4-4-4"
                                />
                              </svg>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>

                    {/* Scroll indicator */}
                    {filteredSidebarTasks.length > 5 && (
                      <div className="mt-2 text-center">
                        <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <span>Scroll for more</span>
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <title>Scroll indicator</title>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 14l-7 7m0 0l-7-7m7 7V3"
                            />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
