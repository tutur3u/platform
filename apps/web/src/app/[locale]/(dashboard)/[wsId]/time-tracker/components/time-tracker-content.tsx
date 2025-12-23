/** biome-ignore-all lint/a11y/noSvgWithoutTitle: <> */
'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle,
  CheckSquare,
  LayoutDashboard,
  MapPin,
  Play,
  PlusCircle,
  Tag,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { TimeTrackingCategory } from '@tuturuuu/types';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import type { User } from '@tuturuuu/types/primitives/User';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
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
import { priorityCompare } from '@tuturuuu/utils/task-helper';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ExtendedWorkspaceTask,
  SessionWithRelations,
  TaskSidebarFilters,
  TimeTrackerData,
} from '../types';
import {
  generateAssigneeInitials,
  getFilteredAndSortedSidebarTasks,
  useTaskCounts,
} from '../utils';
import { TimerControls } from './timer-controls';
import type { Workspace } from '@tuturuuu/types';

dayjs.extend(utc);
dayjs.extend(timezone);

interface TimeTrackerContentProps {
  wsId: string;
  initialData: TimeTrackerData;
  currentUser: User | null;
  isUserLoading: boolean;
  workspace: Workspace;
}

export default function TimeTrackerContent({
  wsId,
  initialData,
  currentUser,
  isUserLoading,
  workspace,
}: TimeTrackerContentProps) {
  const t = useTranslations('time-tracker.content');

  const currentUserId = currentUser?.id || null;

  const getPriorityBadge = useCallback(
    (priority: TaskPriority | null | undefined) => {
      switch (priority) {
        case 'critical':
          return { text: t('priority.urgent'), color: 'bg-red-500' };
        case 'high':
          return { text: t('priority.high'), color: 'bg-orange-500' };
        case 'normal':
          return { text: t('priority.medium'), color: 'bg-yellow-500' };
        case 'low':
          return { text: t('priority.low'), color: 'bg-green-500' };
        default:
          return { text: t('priority.noPriority'), color: 'bg-gray-500' };
      }
    },
    [t]
  );

  // Use React Query for running session to sync with command palette
  const { data: runningSessionFromQuery } = useQuery({
    queryKey: ['running-time-session', wsId],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running`
      );
      if (!response.ok) throw new Error('Failed to fetch running session');
      const data = await response.json();
      return data.session;
    },
    refetchInterval: 30000, // 30 seconds
    initialData: initialData.runningSession,
    enabled: !!currentUser,
  });

  const [currentSession, setCurrentSession] =
    useState<SessionWithRelations | null>(initialData.runningSession);
  const [categories, setCategories] = useState<TimeTrackingCategory[]>(
    initialData.categories || []
  );
  const [recentSessions, setRecentSessions] = useState<SessionWithRelations[]>(
    initialData.recentSessions || []
  );

  // Sync React Query data with local state
  useEffect(() => {
    if (currentUser && runningSessionFromQuery !== undefined) {
      setCurrentSession(runningSessionFromQuery);
      setIsRunning(!!runningSessionFromQuery);
      if (runningSessionFromQuery) {
        const elapsed = Math.max(
          0,
          Math.floor(
            (Date.now() -
              new Date(runningSessionFromQuery.start_time).getTime()) /
              1000
          )
        );
        setElapsedTime(elapsed);
      } else {
        setElapsedTime(0);
      }
    }
  }, [runningSessionFromQuery, currentUser]);

  // Timer state (only for current user)
  const [elapsedTime, setElapsedTime] = useState(() => {
    if (!initialData.runningSession) return 0;
    const elapsed = Math.floor(
      (Date.now() - new Date(initialData.runningSession.start_time).getTime()) /
        1000
    );
    return Math.max(0, elapsed); // Ensure non-negative
  });
  const [isRunning, setIsRunning] = useState(!!initialData.runningSession);
  const [tasks, setTasks] = useState<ExtendedWorkspaceTask[]>(
    initialData.tasks || []
  );

  // Quick actions state
  const [showContinueConfirm, setShowContinueConfirm] = useState(false);
  const [showTaskSelector, setShowTaskSelector] = useState(false);
  const [availableTasks, setAvailableTasks] = useState<ExtendedWorkspaceTask[]>(
    []
  );

  // Enhanced loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Refs for cleanup
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const isMountedRef = useRef(true);

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

        setRetryCount(0);
        return response.json();
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          throw err;
        }

        const message = err instanceof Error ? err.message : 'Network error';
        console.error('API call failed:', message);
        throw new Error(message);
      }
    },
    []
  );

  // Function to fetch next tasks with smart priority logic
  const fetchNextTasks = useCallback(async () => {
    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/tasks?limit=100`
      );

      // 1. First priority: Urgent tasks (priority 1) assigned to current user
      const myUrgentTasks = response.tasks.filter(
        (task: ExtendedWorkspaceTask) => {
          const isUrgent = task.priority === 'critical'; // Priority 1 = Urgent
          const isNotCompleted = !task.completed;
          const isAssignedToMe = task.is_assigned_to_current_user;
          return isUrgent && isNotCompleted && isAssignedToMe;
        }
      );

      // 2. Second priority: Urgent unassigned tasks (user can assign themselves)
      const urgentUnassigned = response.tasks.filter(
        (task: ExtendedWorkspaceTask) => {
          const isUrgent = task.priority === 'critical'; // Priority 1 = Urgent
          const isNotCompleted = !task.completed;
          const isUnassigned = !task.assignees || task.assignees.length === 0;
          return isUrgent && isNotCompleted && isUnassigned;
        }
      );

      // 3. Third priority: Other tasks assigned to current user (High → Medium → Low)
      const myOtherTasks = response.tasks.filter(
        (task: ExtendedWorkspaceTask) => {
          const isNotUrgent = !task.priority || task.priority !== 'critical';
          const isNotCompleted = !task.completed;
          const isAssignedToMe = task.is_assigned_to_current_user;
          return isNotUrgent && isNotCompleted && isAssignedToMe;
        }
      );

      // Combine and sort by priority within each group (lower number = higher priority)
      const prioritizedTasks = [
        ...myUrgentTasks.sort(
          (a: ExtendedWorkspaceTask, b: ExtendedWorkspaceTask) =>
            priorityCompare(a.priority ?? null, b.priority ?? null)
        ),
        ...urgentUnassigned.sort(
          (a: ExtendedWorkspaceTask, b: ExtendedWorkspaceTask) =>
            priorityCompare(a.priority ?? null, b.priority ?? null)
        ),
        ...myOtherTasks.sort(
          (a: ExtendedWorkspaceTask, b: ExtendedWorkspaceTask) =>
            priorityCompare(a.priority ?? null, b.priority ?? null)
        ),
      ];

      setAvailableTasks(prioritizedTasks);
    } catch (error) {
      console.error('Error fetching next tasks:', error);
      setAvailableTasks([]);
    }
  }, [wsId, apiCall]);

  // Fetch next task preview on mount
  useEffect(() => {
    fetchNextTasks();
  }, [fetchNextTasks]);

  // Memoized formatters
  const formatTime = useCallback((seconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const secs = safeSeconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const formatDuration = useCallback((seconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }, []);

  // Fetch all data with enhanced error handling and exponential backoff
  const fetchData = useCallback(
    async (showLoading = true, isRetry = false) => {
      if (!currentUserId || !isMountedRef.current) return;

      if (showLoading && !isRetry) setIsLoading(true);

      try {
        const userParam = currentUserId ? `&userId=${currentUserId}` : '';
        const goalsUserParam = currentUserId ? `?userId=${currentUserId}` : '';

        // Individual API calls with error handling for each
        const apiCalls = [
          {
            name: 'categories',
            call: () =>
              apiCall(`/api/v1/workspaces/${wsId}/time-tracking/categories`),
            fallback: { categories: [] },
          },
          {
            name: 'running',
            call: () =>
              apiCall(
                `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running`
              ),
            fallback: { session: null },
          },
          {
            name: 'recent',
            call: () =>
              apiCall(
                `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=recent&limit=50${userParam}`
              ),
            fallback: { sessions: [] },
          },
          {
            name: 'stats',
            call: () =>
              apiCall(
                `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=stats${userParam}`
              ),
            fallback: {
              stats: { todayTime: 0, weekTime: 0, monthTime: 0, streak: 0 },
            },
          },
          {
            name: 'goals',
            call: () =>
              apiCall(
                `/api/v1/workspaces/${wsId}/time-tracking/goals${goalsUserParam}`
              ),
            fallback: { goals: [] },
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
        const [
          categoriesRes,
          runningRes,
          recentRes,
          _statsRes,
          _goalsRes,
          tasksRes,
        ] = results.map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            if (!apiCalls[index]) return null;
            const { name, fallback } = apiCalls[index];
            console.warn(`API call for ${name} failed:`, result.reason);
            // Only show error toast for critical failures, not for tasks
            if (name !== 'tasks') {
              toast.error(
                t('errors.failedToLoad', {
                  name,
                  message: result.reason.message || 'Unknown error',
                })
              );
            }
            return fallback;
          }
        });

        if (!isMountedRef.current) return;

        setCategories(categoriesRes.categories || []);
        setRecentSessions(recentRes.sessions || []);
        setTasks(tasksRes.tasks || []);

        if (runningRes.session) {
          setCurrentSession(runningRes.session);
          setIsRunning(true);
          const elapsed = Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(runningRes.session.start_time).getTime()) /
                1000
            )
          );
          setElapsedTime(elapsed);
        } else {
          setCurrentSession(null);
          setIsRunning(false);
          setElapsedTime(0);
        }

        setRetryCount(0);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        const message =
          error instanceof Error ? error.message : 'Failed to load data';
        console.error('Error fetching time tracking data:', error);

        if (isMountedRef.current) {
          setRetryCount((prev) => prev + 1);

          if (!isRetry) {
            toast.error(t('errors.failedToLoadData', { message }));
          }
        }
      } finally {
        if (showLoading && isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [wsId, apiCall, currentUserId]
  );

  // Handle starting a task session
  const handleStartTask = useCallback(
    async (task: ExtendedWorkspaceTask) => {
      try {
        if (!task || !currentUserId) return;

        const isUnassigned =
          !task || !task.assignees || task.assignees.length === 0;

        // If task is unassigned, assign to current user first
        if (isUnassigned) {
          const supabase = createClient();

          const { error: assignError } = await supabase
            .from('task_assignees')
            .insert({
              task_id: task.id,
              user_id: currentUserId,
            });

          if (assignError) {
            console.error('Task assignment error:', assignError);
            throw new Error(assignError.message || 'Failed to assign task');
          }

          toast.success(t('toast.assignedToYourself', { taskName: task.name }));
        }

        // Start session
        const response = await apiCall(
          `/api/v1/workspaces/${wsId}/time-tracking/sessions`,
          {
            method: 'POST',
            body: JSON.stringify({
              title: task.name,
              description: task.description
                ? getDescriptionText(task.description)
                : `Working on: ${task.name}`,
              task_id: task.id,
              category_id:
                categories.find((c) => c.name.toLowerCase().includes('work'))
                  ?.id || null,
            }),
          }
        );

        setCurrentSession(response.session);
        setIsRunning(true);
        setElapsedTime(0);
        await fetchData();

        toast.success(t('toast.startedTask', { taskName: task.name }));
        setShowTaskSelector(false);
      } catch (error) {
        console.error('Error starting task session:', error);
        toast.error(t('toast.failedToStart'));
      }
    },
    [wsId, apiCall, currentUserId, categories, fetchData]
  );

  // Auto-refresh with exponential backoff and visibility check
  useEffect(() => {
    const refreshInterval = Math.min(30000 * 2 ** retryCount, 300000); // Max 5 minutes

    refreshIntervalRef.current = setInterval(() => {
      if (document.visibilityState === 'visible' && !isLoading) {
        fetchData(false, retryCount > 0); // Silent refresh
      }
    }, refreshInterval);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [isLoading, retryCount, fetchData]);

  // Timer effect with better cleanup
  useEffect(() => {
    if (isRunning && currentSession) {
      timerIntervalRef.current = setInterval(() => {
        if (isMountedRef.current) {
          const elapsed = Math.max(
            0,
            Math.floor(
              (Date.now() - new Date(currentSession.start_time).getTime()) /
                1000
            )
          );
          setElapsedTime(elapsed);
        }
      }, 1000);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [isRunning, currentSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, []);

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

  if (isUserLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <p className="animate-pulse text-muted-foreground text-sm">
            {t('loading')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Tasks on left, Timer controls on right */}
      <div className="grid grid-cols-1 gap-6 pb-6 lg:grid-cols-5 lg:items-start">
        {/* Left Side: Switchable Sidebar Views - Second on mobile */}
        <div className="order-2 lg:order-1 lg:col-span-2">
          {/* Tasks View */}
          <Card>
            <CardHeader>
              {/* Header Section */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-indigo-600 shadow-lg">
                  <CheckCircle className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg sm:text-xl">
                    {t('taskWorkspace')}
                  </CardTitle>
                  <CardDescription>{t('dragTasksDescription')}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
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
                      'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-xs transition-all',
                      tasksSidebarFilters.assignee === 'mine'
                        ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:ring-blue-800'
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <CheckCircle className="h-3 w-3" />
                    {t('myTasks')}
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
                      'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-xs transition-all',
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
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                    {t('unassigned')}
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
                      placeholder={t('searchTasks')}
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
                      <SelectValue placeholder={t('board')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('allBoards')}</SelectItem>
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
                      <SelectValue placeholder={t('list')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('allLists')}</SelectItem>
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
                    <span className="text-muted-foreground text-xs">
                      {t('activeFilters')}
                    </span>
                    {tasksSidebarSearch && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-1 text-blue-700 text-xs dark:bg-blue-900/30 dark:text-blue-300">
                        Search: "{tasksSidebarSearch}"
                        <button
                          type="button"
                          onClick={() => setTasksSidebarSearch('')}
                          className="hover:text-blue-900 dark:hover:text-blue-100"
                        >
                          ×
                        </button>
                      </span>
                    )}
                    {tasksSidebarFilters.board !== 'all' && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-1 text-green-700 text-xs dark:bg-green-900/30 dark:text-green-300">
                        Board: {tasksSidebarFilters.board}
                        <button
                          type="button"
                          onClick={() =>
                            setTasksSidebarFilters((prev) => ({
                              ...prev,
                              board: 'all',
                            }))
                          }
                          className="hover:text-green-900 dark:hover:text-green-100"
                        >
                          ×
                        </button>
                      </span>
                    )}
                    {tasksSidebarFilters.list !== 'all' && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-purple-100 px-2 py-1 text-purple-700 text-xs dark:bg-purple-900/30 dark:text-purple-300">
                        List: {tasksSidebarFilters.list}
                        <button
                          type="button"
                          onClick={() =>
                            setTasksSidebarFilters((prev) => ({
                              ...prev,
                              list: 'all',
                            }))
                          }
                          className="hover:text-purple-900 dark:hover:text-purple-100"
                        >
                          ×
                        </button>
                      </span>
                    )}
                    {tasksSidebarFilters.assignee !== 'all' && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-orange-100 px-2 py-1 text-orange-700 text-xs dark:bg-orange-900/30 dark:text-orange-300">
                        {tasksSidebarFilters.assignee === 'mine'
                          ? t('myTasks')
                          : tasksSidebarFilters.assignee === 'unassigned'
                            ? t('unassigned')
                            : t('assigneeFilter')}
                        <button
                          type="button"
                          onClick={() =>
                            setTasksSidebarFilters((prev) => ({
                              ...prev,
                              assignee: 'all',
                            }))
                          }
                          className="hover:text-orange-900 dark:hover:text-orange-100"
                        >
                          ×
                        </button>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setTasksSidebarSearch('');
                        setTasksSidebarFilters({
                          board: 'all',
                          list: 'all',
                          assignee: 'all',
                        });
                      }}
                      className="text-muted-foreground text-xs hover:text-foreground"
                    >
                      {t('clearAll')}
                    </button>
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
                      <div className="rounded-lg border-2 border-muted-foreground/25 border-dashed p-4 text-center">
                        <CheckCircle className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                        <p className="mb-2 font-medium text-muted-foreground text-sm">
                          {t('noTasksAvailable')}
                        </p>
                        <p className="mb-3 text-muted-foreground text-xs">
                          {t('createTasksInstruction')}
                        </p>
                        <Link href={`/${wsId}/tasks/boards`}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                          >
                            {t('goToTasksTab')}
                          </Button>
                        </Link>
                      </div>
                    );
                  }

                  if (filteredSidebarTasks.length === 0) {
                    return (
                      <div className="rounded-lg border-2 border-muted-foreground/25 border-dashed p-6 text-center">
                        <CheckCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground text-sm">
                          {t('noTasksFound')}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <>
                      {/* Task Count Header */}
                      <div className="mb-3 flex items-center justify-between px-1 text-muted-foreground text-xs">
                        <span>
                          {filteredSidebarTasks.length} task
                          {filteredSidebarTasks.length !== 1 ? 's' : ''}{' '}
                          available
                          {(tasksSidebarSearch ||
                            tasksSidebarFilters.board !== 'all' ||
                            tasksSidebarFilters.list !== 'all' ||
                            tasksSidebarFilters.assignee !== 'all') &&
                            ` (filtered from ${tasks.length} total)`}
                        </span>
                        <span className="font-medium text-blue-600 dark:text-blue-400">
                          {t('dragToTimer')}
                        </span>
                      </div>

                      {/* Scrollable Task Container */}
                      <div className="/40 max-h-100 overflow-y-auto rounded-lg border bg-gray-50/30 p-4 dark:border-gray-700/40 dark:bg-gray-800/20">
                        <div className="space-y-4">
                          {filteredSidebarTasks.map((task) => (
                            <div
                              key={task.id}
                              id={`task-${task.id}`}
                              className={cn(
                                'group cursor-grab rounded-lg border p-4 shadow-sm transition-all duration-200 hover:scale-[1.01] hover:shadow-md active:cursor-grabbing',
                                // Enhanced styling for assigned tasks
                                task.is_assigned_to_current_user
                                  ? 'border-blue-300 bg-linear-to-br from-blue-50 to-blue-100 ring-1 ring-blue-200 dark:border-blue-700 dark:from-blue-950/30 dark:to-blue-900/30 dark:ring-blue-800'
                                  : '/60 bg-white dark:border-gray-700/60 dark:bg-gray-800/80',
                                isDraggingTask &&
                                  'shadow-blue-500/10 shadow-md ring-1 ring-blue-400/30'
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
                                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                                    task.is_assigned_to_current_user
                                      ? 'border-blue-300 bg-linear-to-br from-blue-100 to-blue-200 dark:border-blue-600 dark:from-blue-800 dark:to-blue-700'
                                      : 'border-blue-200/60 bg-linear-to-br from-blue-50 to-blue-100 dark:border-blue-700/60 dark:from-blue-900/50 dark:to-blue-800/50'
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
                                        'mb-1 font-medium text-sm',
                                        task.is_assigned_to_current_user
                                          ? 'text-blue-900 dark:text-blue-100'
                                          : 'text-gray-900 dark:text-gray-100'
                                      )}
                                    >
                                      {task.name}
                                      {task.is_assigned_to_current_user && (
                                        <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-800 text-xs dark:bg-blue-900/50 dark:text-blue-200">
                                          Assigned to you
                                        </span>
                                      )}
                                    </h4>
                                  </div>
                                  {task.description && (
                                    <p className="mb-3 line-clamp-2 text-gray-600 text-xs dark:text-gray-400">
                                      {getDescriptionText(task.description)}
                                    </p>
                                  )}

                                  {/* Assignees Display */}
                                  {task.assignees &&
                                    task.assignees.length > 0 && (
                                      <div className="mb-2 flex items-center gap-2">
                                        <div className="flex -space-x-1">
                                          {task.assignees
                                            .slice(0, 3)
                                            .map((assignee) => (
                                              <div
                                                key={assignee.id}
                                                className="h-5 w-5 rounded-full border-2 border-white bg-linear-to-br from-gray-100 to-gray-200 dark:border-gray-800 dark:from-gray-700 dark:to-gray-600"
                                                title={
                                                  assignee.display_name ||
                                                  assignee.email
                                                }
                                              >
                                                {assignee.avatar_url ? (
                                                  // biome-ignore lint/performance/noImgElement: <>
                                                  <img
                                                    src={assignee.avatar_url}
                                                    alt={
                                                      assignee.display_name ||
                                                      assignee.email ||
                                                      ''
                                                    }
                                                    className="h-full w-full rounded-full object-cover"
                                                  />
                                                ) : (
                                                  <div className="flex h-full w-full items-center justify-center font-medium text-[8px] text-gray-600 dark:text-gray-300">
                                                    {generateAssigneeInitials(
                                                      assignee
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            ))}
                                          {task.assignees.length > 3 && (
                                            <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-gray-200 font-medium text-[8px] text-gray-600 dark:border-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                              +{task.assignees.length - 3}
                                            </div>
                                          )}
                                        </div>
                                        <span className="text-muted-foreground text-xs">
                                          {task.assignees.length} assigned
                                        </span>
                                      </div>
                                    )}

                                  {task.board_name && task.list_name && (
                                    <div className="flex items-center gap-2">
                                      <div className="flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 dark:bg-gray-700">
                                        <MapPin className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                                        <span className="font-medium text-gray-600 text-xs dark:text-gray-300">
                                          {task.board_name}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 dark:bg-blue-900/30">
                                        <Tag className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                        <span className="font-medium text-blue-700 text-xs dark:text-blue-300">
                                          {task.list_name}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5 text-gray-400 text-xs opacity-0 transition-opacity group-hover:opacity-100">
                                  <span className="font-medium">Drag</span>
                                  <svg
                                    className="h-3.5 w-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M8 9l4-4 4 4m0 6l-4 4-4-4"
                                    />
                                  </svg>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Scroll indicator */}
                        {filteredSidebarTasks.length > 5 && (
                          <div className="mt-2 text-center">
                            <div className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                              <span>Scroll for more</span>
                              <svg
                                className="h-3 w-3"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
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
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Tabs with Timer Controls - First on mobile */}
        <div className="order-1 lg:order-2 lg:col-span-3">
          <div className="fade-in-50 animate-in duration-300">
            <TimerControls
              wsId={wsId}
              currentSession={currentSession}
              setCurrentSession={setCurrentSession}
              elapsedTime={elapsedTime}
              setElapsedTime={setElapsedTime}
              isRunning={isRunning}
              setIsRunning={setIsRunning}
              categories={categories}
              tasks={tasks}
              onSessionUpdate={() => fetchData(false)}
              formatTime={formatTime}
              formatDuration={formatDuration}
              apiCall={apiCall}
              isDraggingTask={isDraggingTask}
              currentUserId={currentUserId ?? null}
              workspace={workspace}
            />
          </div>
        </div>
      </div>

      {/* Continue Last Session Confirmation Dialog */}
      {showContinueConfirm && recentSessions[0] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-full bg-blue-100 p-2 dark:bg-blue-900/30">
                <Play className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {t('continueLastSession')}
                </h3>
                <p className="text-gray-600 text-sm dark:text-gray-400">
                  {t('resumePreviousSession')}
                </p>
              </div>
            </div>

            <div className="mb-4 rounded-lg border p-3 dark:border-gray-700">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {recentSessions[0].title}
              </p>
              {recentSessions[0].description && (
                <p className="text-gray-600 text-sm dark:text-gray-400">
                  {recentSessions[0].description}
                </p>
              )}
              {recentSessions[0].category && (
                <div className="mt-2 flex items-center gap-2">
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full',
                      recentSessions[0].category.color
                        ? `bg-dynamic-${recentSessions[0].category.color.toLowerCase()}/70`
                        : 'bg-blue-500/70'
                    )}
                  />
                  <span className="text-gray-600 text-xs dark:text-gray-400">
                    {recentSessions[0].category.name}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setShowContinueConfirm(false)}
                className="flex-1"
              >
                {t('cancel')}
              </Button>
              <Button
                onClick={async () => {
                  if (!recentSessions[0]) return;
                  try {
                    const response = await apiCall(
                      `/api/v1/workspaces/${wsId}/time-tracking/sessions/${recentSessions[0].id}`,
                      {
                        method: 'PATCH',
                        body: JSON.stringify({ action: 'resume' }),
                      }
                    );

                    setCurrentSession(response.session);
                    setIsRunning(true);
                    setElapsedTime(0);
                    await fetchData();

                    toast.success(
                      t('toast.resumedSession', {
                        title: recentSessions[0].title,
                      })
                    );
                    setShowContinueConfirm(false);
                  } catch (error) {
                    console.error('Error resuming session:', error);
                    toast.error(t('toast.failedToResume'));
                  }
                }}
                className="flex-1"
              >
                {t('continueSession')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Task Selector Dialog */}
      {showTaskSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-2xl rounded-xl border bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-full bg-purple-100 p-2 dark:bg-purple-900/30">
                <CheckSquare className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {t('chooseNextTask')}
                </h3>
                <p className="text-gray-600 text-sm dark:text-gray-400">
                  {t('tasksPrioritized')}
                </p>
              </div>
            </div>

            <div className="mb-4 max-h-96 space-y-2 overflow-y-auto">
              {availableTasks.length === 0 ? (
                // No tasks available - show creation options
                <div className="space-y-4">
                  <div className="rounded-lg border-2 border-gray-300 border-dashed p-8 text-center dark:border-gray-600">
                    <CheckSquare className="mx-auto mb-3 h-8 w-8 text-gray-400" />
                    <h4 className="mb-2 font-medium text-gray-900 dark:text-gray-100">
                      {t('noTasksAvailableTitle')}
                    </h4>
                    <p className="mb-4 text-gray-600 text-sm dark:text-gray-400">
                      {t('noAssignedTasksMessage')}
                    </p>

                    <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                      <Button
                        onClick={() => {
                          // Open command palette to create task
                          setShowTaskSelector(false);
                          // Simulate Ctrl+K to open command palette
                          const event = new KeyboardEvent('keydown', {
                            key: 'k',
                            ctrlKey: true,
                            metaKey: true,
                          });
                          document.dispatchEvent(event);
                        }}
                        className="gap-2"
                      >
                        <PlusCircle className="h-4 w-4" />
                        {t('createTask')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowTaskSelector(false);
                          window.location.href = `/${wsId}/tasks/boards`;
                        }}
                        className="gap-2"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        {t('viewBoards')}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                availableTasks.map((task) => {
                  const priorityBadge = getPriorityBadge(task.priority);
                  const isUnassigned =
                    !task || !task.assignees || task.assignees.length === 0;

                  return (
                    <button
                      type="button"
                      key={task.id}
                      onClick={() => handleStartTask(task)}
                      className="group flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all hover:border-purple-300 hover:bg-purple-50 dark:border-gray-700 dark:hover:border-purple-600 dark:hover:bg-purple-900/20"
                    >
                      <div
                        className={cn(
                          'mt-0.5 h-2 w-2 rounded-full',
                          priorityBadge.color
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100">
                            {task.name}
                          </h4>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 font-medium text-white text-xs',
                              priorityBadge.color
                            )}
                          >
                            {priorityBadge.text}
                          </span>
                          {isUnassigned && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700 text-xs dark:bg-blue-900/30 dark:text-blue-300">
                              Will assign to you
                            </span>
                          )}
                        </div>
                        {task.description && (
                          <p className="mb-2 line-clamp-2 text-gray-600 text-sm dark:text-gray-400">
                            {getDescriptionText(task.description)}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-gray-500 text-xs dark:text-gray-400">
                          {task.board_name && task.list_name && (
                            <>
                              <span>{task.board_name}</span>
                              <span>•</span>
                              <span>{task.list_name}</span>
                              <span>•</span>
                            </>
                          )}
                          <span
                            className={cn(
                              isUnassigned
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-green-600 dark:text-green-400'
                            )}
                          >
                            {isUnassigned
                              ? t('unassigned')
                              : t('assignedToYou')}
                          </span>
                        </div>
                      </div>
                      <div className="ml-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <Play className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => setShowTaskSelector(false)}
              >
                {t('cancel')}
              </Button>
              {availableTasks.length > 0 && (
                <div className="flex items-center gap-4">
                  <p className="text-gray-500 text-sm dark:text-gray-400">
                    {availableTasks.length} task
                    {availableTasks.length !== 1 ? 's' : ''} prioritized
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowTaskSelector(false);
                      window.location.href = `/${wsId}/tasks/boards`;
                    }}
                  >
                    {t('viewAllTasks')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
