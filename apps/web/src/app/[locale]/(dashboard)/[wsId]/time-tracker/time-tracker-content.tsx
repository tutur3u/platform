'use client';

import { useQuery } from '@tanstack/react-query';
import type { TimeTrackingCategory } from '@tuturuuu/types/db';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import {
  AlertCircle,
  CheckSquare,
  Clock,
  LayoutDashboard,
  Pause,
  Play,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Timer,
  TrendingUp,
  WifiOff,
} from '@tuturuuu/ui/icons';
import { toast } from '@tuturuuu/ui/sonner';

import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useCallback, useEffect, useRef, useState } from 'react';
import { priorityCompare } from '@/lib/task-helper';
import { TimerControls } from './components/timer-controls';
import { UserSelector } from './components/user-selector';
import { useCurrentUser } from './hooks/use-current-user';
import type {
  ExtendedWorkspaceTask,
  SessionWithRelations,
  TimerStats,
  TimeTrackerData,
} from './types';

// interface TaskSidebarFilters {
//   board: string;
//   list: string;
//   assignee: string;
// }

dayjs.extend(utc);
dayjs.extend(timezone);

interface TimeTrackerContentProps {
  wsId: string;
  initialData: TimeTrackerData;
}

const getPriorityBadge = (priority: TaskPriority | null | undefined) => {
  switch (priority) {
    case 'critical':
      return { text: 'Urgent', color: 'bg-red-500' };
    case 'high':
      return { text: 'High', color: 'bg-orange-500' };
    case 'normal':
      return { text: 'Medium', color: 'bg-yellow-500' };
    case 'low':
      return { text: 'Low', color: 'bg-green-500' };
    default:
      return { text: 'No Priority', color: 'bg-gray-500' };
  }
};

export default function TimeTrackerContent({
  wsId,
  initialData,
}: TimeTrackerContentProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { userId: currentUserId, isLoading: isLoadingUser } = useCurrentUser();

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
    enabled: !selectedUserId, // Only fetch for current user
  });

  const [currentSession, setCurrentSession] =
    useState<SessionWithRelations | null>(initialData.runningSession);
  const [categories, setCategories] = useState<TimeTrackingCategory[]>(
    initialData.categories || []
  );

  const [recentSessions, setRecentSessions] = useState<SessionWithRelations[]>(
    initialData.recentSessions || []
  );
  const [timerStats, setTimerStats] = useState<TimerStats>(initialData.stats);

  // Sync React Query data with local state
  useEffect(() => {
    if (!selectedUserId && runningSessionFromQuery !== undefined) {
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
  }, [runningSessionFromQuery, selectedUserId]);

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
  const [nextTaskPreview, setNextTaskPreview] =
    useState<ExtendedWorkspaceTask | null>(null);

  // Enhanced loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [retryCount, setRetryCount] = useState(0);

  // Heatmap settings state (unused but kept for future use)
  // const [heatmapSettings, setHeatmapSettings] = useState(() => {
  //   if (typeof window !== 'undefined') {
  //     const saved = localStorage.getItem('heatmap-settings');
  //     if (saved) {
  //       try {
  //           return JSON.parse(saved);
  //         } catch {
  //           // Fall through to default
  //         }
  //       }
  //     }
  //     return {
  //       viewMode: 'original' as 'original' | 'hybrid' | 'calendar-only',
  //       timeReference: 'smart' as 'relative' | 'absolute' | 'smart',
  //       showOnboardingTips: true,
  //     };
  //   });

  // Listen for heatmap settings changes from child components (unused but kept for future use)
  // useEffect(() => {
  //   const handleSettingsChange = (event: CustomEvent) => {
  //     setHeatmapSettings(event.detail);
  //   };

  //   if (typeof window !== 'undefined') {
  //     window.addEventListener(
  //       'heatmap-settings-changed',
  //       handleSettingsChange as EventListener
  //     );

  //     return () => {
  //       window.removeEventListener(
  //         'heatmap-settings-changed',
  //         handleSettingsChange as EventListener
  //       );
  //     };
  //   }
  // }, []);

  // Refs for cleanup
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const isMountedRef = useRef(true);

  // Whether we're viewing another user's data
  const isViewingOtherUser = selectedUserId !== null;

  // Get user timezone
  const userTimezone = dayjs.tz.guess();

  // Calculate focus score for sessions
  const calculateFocusScore = useCallback(
    (session: SessionWithRelations): number => {
      if (!session.duration_seconds) return 0;

      // Base score from duration (longer sessions = higher focus)
      const durationScore = Math.min(session.duration_seconds / 7200, 1) * 40; // Max 40 points for 2+ hours

      // Bonus for consistency (sessions without interruptions)
      const consistencyBonus = session.description?.includes('resumed')
        ? 0
        : 20;

      // Time of day bonus (peak hours get bonus)
      const sessionHour = dayjs.utc(session.start_time).tz(userTimezone).hour();
      const peakHoursBonus =
        (sessionHour >= 9 && sessionHour <= 11) ||
        (sessionHour >= 14 && sessionHour <= 16)
          ? 20
          : 0;

      // Category bonus (work categories get slight bonus)
      const categoryBonus = session.category?.name
        ?.toLowerCase()
        .includes('work')
        ? 10
        : 0;

      // Task completion bonus
      const taskBonus = session.task_id ? 10 : 0;

      return Math.min(
        durationScore +
          consistencyBonus +
          peakHoursBonus +
          categoryBonus +
          taskBonus,
        100
      );
    },
    [userTimezone]
  );

  // Calculate productivity metrics (unused but kept for future use)
  // const productivityMetrics = useMemo(() => {
  //   if (!recentSessions.length) {
  //     return {
  //       avgFocusScore: 0,
  //       todaySessionCount: 0,
  //     };
  //   }

  //   const today = dayjs().tz(userTimezone);
  //   const todaySessions = recentSessions.filter((session) => {
  //     const sessionDate = dayjs.utc(session.start_time).tz(userTimezone);
  //       return sessionDate.isSame(today, 'day');
  //     });

  //   const focusScores = recentSessions
  //     .slice(0, 10)
  //     .map((session) => calculateFocusScore(session));
  //   const avgFocusScore =
  //     focusScores.length > 0
  //       ? Math.round(
  //           focusScores.reduce((sum, score) => sum + score, 0) /
  //             focusScores.length
  //         )
  //         : 0;

  //   return {
  //     avgFocusScore,
  //     todaySessionCount: todaySessions.length,
  //   };
  // }, [recentSessions, calculateFocusScore, userTimezone]);

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

  // Function to fetch next tasks with smart priority logic
  const fetchNextTasks = useCallback(async () => {
    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/tasks?limit=100`
      );
      let prioritizedTasks = [];

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
      prioritizedTasks = [
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
      setNextTaskPreview(prioritizedTasks[0] || null);
    } catch (error) {
      console.error('Error fetching next tasks:', error);
      setAvailableTasks([]);
      setNextTaskPreview(null);
    }
  }, [wsId, apiCall]);

  // Fetch next task preview on mount
  useEffect(() => {
    if (!isViewingOtherUser) {
      fetchNextTasks();
    }
  }, [fetchNextTasks, isViewingOtherUser]);

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
      setError(null);

      try {
        const userParam = selectedUserId ? `&userId=${selectedUserId}` : '';
        const goalsUserParam = selectedUserId
          ? `?userId=${selectedUserId}`
          : '';

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
              !isViewingOtherUser
                ? apiCall(
                    `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running`
                  )
                : Promise.resolve({ session: null }),
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
        const [categoriesRes, runningRes, recentRes, statsRes, , tasksRes] =
          results.map((result, index) => {
            if (result.status === 'fulfilled') {
              return result.value;
            } else {
              const { name, fallback } = apiCalls[index] || {
                name: 'unknown',
                fallback: {},
              };
              console.warn(`API call for ${name} failed:`, result.reason);
              // Only show error toast for critical failures, not for tasks
              if (name !== 'tasks') {
                toast.error(
                  `Failed to load ${name}: ${result.reason.message || 'Unknown error'}`
                );
              }
              return fallback;
            }
          });

        if (!isMountedRef.current) return;

        setCategories(categoriesRes.categories || []);
        setRecentSessions(recentRes.sessions || []);
        setTimerStats(
          statsRes.stats || {
            todayTime: 0,
            weekTime: 0,
            monthTime: 0,
            streak: 0,
          }
        );

        setTasks(tasksRes.tasks || []);

        // Only update timer state if we're viewing current user's data
        if (!isViewingOtherUser) {
          if (runningRes.session) {
            setCurrentSession(runningRes.session);
            setIsRunning(true);
            const elapsed = Math.max(
              0,
              Math.floor(
                (Date.now() -
                  new Date(runningRes.session.start_time).getTime()) /
                  1000
              )
            );
            setElapsedTime(elapsed);
          } else {
            setCurrentSession(null);
            setIsRunning(false);
            setElapsedTime(0);
          }
        } else {
          // Clear timer state when viewing other users
          setCurrentSession(null);
          setIsRunning(false);
          setElapsedTime(0);
        }

        setLastRefresh(new Date());
        setRetryCount(0);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        const message =
          error instanceof Error ? error.message : 'Failed to load data';
        console.error('Error fetching time tracking data:', error);

        if (isMountedRef.current) {
          setError(message);
          setRetryCount((prev) => prev + 1);

          if (!isRetry) {
            toast.error(`Failed to load time tracking data: ${message}`);
          }
        }
      } finally {
        if (showLoading && isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [wsId, apiCall, currentUserId, selectedUserId, isViewingOtherUser]
  );

  // Ref to hold the latest fetchData function to avoid stale closures
  const fetchDataRef = useRef(fetchData);
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  // Auto-refresh with exponential backoff and visibility check
  useEffect(() => {
    const refreshInterval = Math.min(30000 * 2 ** retryCount, 300000); // Max 5 minutes

    refreshIntervalRef.current = setInterval(() => {
      if (document.visibilityState === 'visible' && !isLoading) {
        fetchDataRef.current(false, retryCount > 0); // Silent refresh
      }
    }, refreshInterval);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [isLoading, retryCount]);

  // Timer effect with better cleanup
  useEffect(() => {
    if (isRunning && currentSession && !isViewingOtherUser) {
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
  }, [isRunning, currentSession, isViewingOtherUser]);

  // Load data on mount and when dependencies change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      if (retryCount > 0) {
        fetchDataRef.current(false, true);
      }
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [retryCount]);

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

  // Handle user selection change
  const handleUserChange = useCallback((userId: string | null) => {
    setSelectedUserId(userId);
  }, []);

  // Retry function with exponential backoff
  const handleRetry = useCallback(() => {
    fetchDataRef.current(true, true);
  }, []);

  // Drag and drop state for highlighting drop zones (unused but kept for future use)
  // const [isDraggingTask, setIsDraggingTask] = useState(false);

  // Tasks sidebar search and filter state with persistence (unused but kept for future use)
  // const [tasksSidebarSearch, setTasksSidebarSearch] = useState('');
  // const [tasksSidebarFilters, setTasksSidebarFilters] =
  //   useState<TaskSidebarFilters>(() => {
  //     if (typeof window !== 'undefined') {
  //       const saved = localStorage.getItem(`time-tracker-filters-${wsId}`);
  //       if (saved) {
  //         try {
  //           return {
  //             board: 'all',
  //             list: 'all',
  //             assignee: 'all',
  //             ...JSON.parse(saved),
  //         };
  //       } catch {
  //         return { board: 'all', list: 'all', assignee: 'all' };
  //       }
  //     }
  //     return { board: 'all', list: 'all', assignee: 'all' };
  //   });

  // Save filters to localStorage when they change (unused but kept for future use)
  // useEffect(() => {
  //   if (typeof window !== 'undefined') {
  //     localStorage.setItem(
  //       `time-tracker-filters-${wsId}`,
  //       JSON.stringify(tasksSidebarFilters)
  //     );
  //   }
  // }, [tasksSidebarFilters, wsId]);

  // Use memoized task counts (unused but kept for future use)
  // const { myTasksCount, unassignedCount } = useTaskCounts(tasks);

  if (isLoadingUser || !currentUserId) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <p className="animate-pulse text-muted-foreground text-sm">
            Loading time tracker...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'fade-in-50 animate-in space-y-6 duration-500',
        isLoading && 'opacity-50'
      )}
    >
      {/* Enhanced Header with Quick Stats */}
      <div className="space-y-6">
        {/* Main Header Section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
                <Timer className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-2xl tracking-tight sm:text-3xl">
                  Time Tracker
                </h1>
                <p className="text-muted-foreground text-sm sm:text-base">
                  {isViewingOtherUser
                    ? "Viewing another user's time tracking data"
                    : 'Track and manage your time across projects'}
                </p>
              </div>
            </div>

            {!isViewingOtherUser && (
              <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-green-500"></div>
                  <span>Week starts Monday</span>
                </div>
                <span>•</span>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                  <span>Times updated in real-time</span>
                </div>
                {(() => {
                  const today = new Date();
                  const dayOfWeek = today.getDay();

                  if (dayOfWeek === 1) {
                    return (
                      <>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <span>🎯</span>
                          <span>Week resets today!</span>
                        </div>
                      </>
                    );
                  } else if (dayOfWeek === 0) {
                    return (
                      <>
                        <span>•</span>
                        <span>Week resets tomorrow</span>
                      </>
                    );
                  } else {
                    return (
                      <>
                        <span>•</span>
                        <span>Week resets Monday</span>
                      </>
                    );
                  }
                })()}
              </div>
            )}

            {lastRefresh && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Clock className="h-3 w-3" />
                <span>Last updated: {lastRefresh.toLocaleTimeString()}</span>
                {isOffline && (
                  <div className="flex items-center gap-1 text-amber-600">
                    <WifiOff className="h-3 w-3" />
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
            <UserSelector
              wsId={wsId}
              selectedUserId={selectedUserId}
              onUserChange={handleUserChange}
              currentUserId={currentUserId}
              apiCall={apiCall}
            />
          </div>
        </div>

        {/* Enhanced Quick Actions - Single Row */}
        {!isViewingOtherUser && (
          // <div className="space-y-3">
          <Accordion collapsible className="w-full" type="single">
            <AccordionItem value="quick-actions">
              <AccordionTrigger>
                <div className="flex flex-1 items-center justify-between">
                  <h3 className="font-medium text-foreground text-sm">
                    ⚡ Quick Actions
                  </h3>
                  <div className="text-muted-foreground text-xs">
                    {(() => {
                      const hour = new Date().getHours();
                      const isPeakTime =
                        (hour >= 9 && hour <= 11) || (hour >= 14 && hour <= 16);
                      return isPeakTime
                        ? '🧠 Peak focus time'
                        : '📈 Building momentum';
                    })()}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                {/* Action Grid with proper spacing to prevent cutoff */}
                <div className="grid grid-cols-2 gap-3 p-1 sm:grid-cols-4 lg:gap-4">
                  {/* Continue Last Session */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!recentSessions[0]) {
                        toast.info('No recent session to continue');
                        return;
                      }
                      if (isRunning) {
                        toast.info('Timer is already running');
                        return;
                      }
                      setShowContinueConfirm(true);
                    }}
                    disabled={!recentSessions[0] || isRunning}
                    className={cn(
                      'group relative rounded-lg border p-3 text-left transition-all duration-300',
                      'hover:shadow-blue-500/20 hover:shadow-lg active:scale-[0.98]',
                      recentSessions[0] && !isRunning
                        ? 'hover:-translate-y-1 border-blue-200/60 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:border-blue-800/60 dark:from-blue-950/30 dark:to-blue-900/20'
                        : 'cursor-not-allowed border-muted bg-muted/30 opacity-60'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className={cn(
                          'flex-shrink-0 rounded-full p-1.5 transition-colors',
                          recentSessions[0] && !isRunning
                            ? 'bg-blue-500/20 group-hover:bg-blue-500/30'
                            : 'bg-muted-foreground/20'
                        )}
                      >
                        <RotateCcw
                          className={cn(
                            'h-3 w-3 transition-transform group-hover:rotate-12',
                            recentSessions[0] && !isRunning
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-muted-foreground'
                          )}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            'font-medium text-xs',
                            recentSessions[0] && !isRunning
                              ? 'text-blue-700 dark:text-blue-300'
                              : 'text-muted-foreground'
                          )}
                        >
                          Continue Last
                        </p>
                        {recentSessions[0] ? (
                          <>
                            <p
                              className="line-clamp-2 font-bold text-blue-900 text-sm dark:text-blue-100"
                              title={recentSessions[0].title}
                            >
                              {recentSessions[0].title}
                            </p>
                            {recentSessions[0].category && (
                              <div className="mt-1 flex items-center gap-1">
                                <div
                                  className={cn(
                                    'h-2 w-2 rounded-full',
                                    recentSessions[0].category.color
                                      ? `bg-dynamic-${recentSessions[0].category.color.toLowerCase()}/70`
                                      : 'bg-blue-500/70'
                                  )}
                                />
                                <span className="truncate text-blue-700/80 text-xs dark:text-blue-300/80">
                                  {recentSessions[0].category.name}
                                </span>
                              </div>
                            )}
                            {/* Focus Score Badge */}
                            {recentSessions[0] && (
                              <div className="mt-1 flex items-center gap-1">
                                <div className="h-1 w-8 rounded-full bg-blue-200 dark:bg-blue-900/50">
                                  <div
                                    className="h-1 rounded-full bg-blue-500 transition-all dark:bg-blue-400"
                                    style={{
                                      width: `${Math.round(calculateFocusScore(recentSessions[0]))}%`,
                                    }}
                                  />
                                </div>
                                <span className="font-medium text-blue-600 text-xs dark:text-blue-400">
                                  Focus:{' '}
                                  {Math.round(
                                    calculateFocusScore(recentSessions[0])
                                  )}
                                  %
                                </span>
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="font-bold text-muted-foreground text-sm">
                            No recent session
                          </p>
                        )}
                      </div>
                    </div>
                    {recentSessions[0] && (
                      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="text-lg">🔄</span>
                      </div>
                    )}
                  </button>

                  {/* Next Task */}
                  <button
                    type="button"
                    onClick={async () => {
                      await fetchNextTasks();

                      if (availableTasks.length === 0) {
                        // No tasks available - show overlay to create tasks or view boards
                        setShowTaskSelector(true);
                        return;
                      }

                      if (availableTasks.length === 1) {
                        // Single task - auto-start
                        const task = availableTasks[0];
                        const isUnassigned =
                          !task ||
                          !task.assignees ||
                          task.assignees.length === 0;

                        try {
                          // If task is unassigned, assign to current user first
                          if (!task) return;
                          if (isUnassigned) {
                            const { createClient } = await import(
                              '@tuturuuu/supabase/next/client'
                            );
                            const supabase = createClient();

                            const { error: assignError } = await supabase
                              .from('task_assignees')
                              .insert({
                                task_id: task.id,
                                user_id: currentUserId,
                              });

                            if (assignError) {
                              console.error(
                                'Task assignment error:',
                                assignError
                              );
                              throw new Error(
                                assignError.message || 'Failed to assign task'
                              );
                            }

                            toast.success(
                              `Assigned task "${task.name}" to yourself`
                            );
                          }

                          // Start session
                          const response = await apiCall(
                            `/api/v1/workspaces/${wsId}/time-tracking/sessions`,
                            {
                              method: 'POST',
                              body: JSON.stringify({
                                title: task.name,
                                description:
                                  task.description ||
                                  `Working on: ${task.name}`,
                                task_id: task.id,
                                category_id:
                                  categories.find((c) =>
                                    c.name.toLowerCase().includes('work')
                                  )?.id || null,
                              }),
                            }
                          );

                          setCurrentSession(response.session);
                          setIsRunning(true);
                          setElapsedTime(0);
                          await fetchData();

                          toast.success(`Started: ${task.name}`);
                        } catch (error) {
                          console.error('Error starting task:', error);
                          toast.error('Failed to start task session');
                        }
                      } else {
                        // Multiple tasks - show selector
                        setShowTaskSelector(true);
                      }
                    }}
                    disabled={isRunning}
                    className={cn(
                      'group relative rounded-lg border p-3 text-left transition-all duration-300',
                      'hover:shadow-lg hover:shadow-purple-500/20 active:scale-[0.98]',
                      !isRunning
                        ? 'hover:-translate-y-1 border-purple-200/60 bg-gradient-to-br from-purple-50 to-purple-100/50 dark:border-purple-800/60 dark:from-purple-950/30 dark:to-purple-900/20'
                        : 'cursor-not-allowed border-muted bg-muted/30 opacity-60'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 rounded-full bg-purple-500/20 p-1.5 transition-colors group-hover:bg-purple-500/30">
                        <CheckSquare className="h-3 w-3 text-purple-600 transition-transform group-hover:scale-110 dark:text-purple-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-purple-700 text-xs dark:text-purple-300">
                          Next Task
                        </p>
                        {nextTaskPreview ? (
                          <>
                            <p className="truncate font-bold text-purple-900 text-sm dark:text-purple-100">
                              {nextTaskPreview.name}
                            </p>
                            <div className="flex items-center gap-1">
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-full px-1.5 py-0.5 font-medium text-xs',
                                  nextTaskPreview.priority === 'critical'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                    : nextTaskPreview.priority === 'high'
                                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
                                      : nextTaskPreview.priority === 'normal'
                                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                                        : nextTaskPreview.priority === 'low'
                                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                          : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-300'
                                )}
                              >
                                {nextTaskPreview.priority === 'critical'
                                  ? 'Urgent'
                                  : nextTaskPreview.priority === 'high'
                                    ? 'High'
                                    : nextTaskPreview.priority === 'normal'
                                      ? 'Medium'
                                      : nextTaskPreview.priority === 'low'
                                        ? 'Low'
                                        : 'No Priority'}
                              </span>
                              {nextTaskPreview.is_assigned_to_current_user ? (
                                <span className="text-purple-600/80 text-xs dark:text-purple-400/80">
                                  • Assigned to you
                                </span>
                              ) : (
                                <span className="text-purple-600/80 text-xs dark:text-purple-400/80">
                                  • Can assign to yourself
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="font-bold text-purple-900 text-sm dark:text-purple-100">
                              No tasks available
                            </p>
                            <p className="text-purple-600/80 text-xs dark:text-purple-400/80">
                              Create or assign tasks
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="text-lg">🎯</span>
                    </div>
                  </button>

                  {/* Break Timer */}
                  <button
                    type="button"
                    onClick={() => {
                      // Scroll to timer controls and pre-fill with break session
                      document
                        .querySelector('[data-timer-controls]')
                        ?.scrollIntoView({ behavior: 'smooth' });

                      setTimeout(() => {
                        const titleInput = document.querySelector(
                          '[data-title-input]'
                        ) as HTMLInputElement;
                        if (titleInput) {
                          titleInput.value = 'Break Time';
                          titleInput.dispatchEvent(
                            new Event('input', { bubbles: true })
                          );
                          titleInput.focus();
                        }
                      }, 300);

                      toast.success(
                        'Break session ready! Take 5-15 minutes to recharge.'
                      );
                    }}
                    disabled={isRunning}
                    className={cn(
                      'group relative rounded-lg border p-3 text-left transition-all duration-300',
                      'hover:shadow-green-500/20 hover:shadow-lg active:scale-[0.98]',
                      !isRunning
                        ? 'hover:-translate-y-1 border-green-200/60 bg-gradient-to-br from-green-50 to-green-100/50 dark:border-green-800/60 dark:from-green-950/30 dark:to-green-900/20'
                        : 'cursor-not-allowed border-muted bg-muted/30 opacity-60'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-shrink-0 rounded-full bg-green-500/20 p-1.5 transition-colors group-hover:bg-green-500/30">
                        <Pause className="h-3 w-3 text-green-600 transition-transform group-hover:scale-110 dark:text-green-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-green-700 text-xs dark:text-green-300">
                          Break Timer
                        </p>
                        <p className="font-bold text-green-900 text-sm dark:text-green-100">
                          Take 5 min
                        </p>
                        <p className="text-green-600/80 text-xs dark:text-green-400/80">
                          Recharge session
                        </p>
                      </div>
                    </div>
                    <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="text-lg">☕</span>
                    </div>
                  </button>
                </div>
              </AccordionContent>
            </AccordionItem>
            {/* </div> */}
          </Accordion>
        )}

        {/* Current Session Status Banner */}
        {!isViewingOtherUser && currentSession && (
          <div className="rounded-lg border border-red-200/60 bg-gradient-to-r from-red-50 to-red-100/50 p-4 shadow-sm dark:border-red-800/60 dark:from-red-950/30 dark:to-red-900/20">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/20">
                <div className="h-2 w-2 animate-pulse rounded-full bg-red-500"></div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-red-700 text-sm dark:text-red-300">
                    Currently tracking:
                  </p>
                  <span className="font-bold text-red-900 text-sm dark:text-red-100">
                    {currentSession.title}
                  </span>
                </div>
                <p className="text-red-600/70 text-xs dark:text-red-400/70">
                  Started at{' '}
                  {new Date(currentSession.start_time).toLocaleTimeString()} •
                  Running for {formatTime(elapsedTime)}
                </p>
              </div>
              <div className="font-bold font-mono text-lg text-red-600 dark:text-red-400">
                {formatTime(elapsedTime)}
              </div>
            </div>
          </div>
        )}

        {/* Error Alert with better UX */}
        {error && (
          <Alert
            variant={isOffline ? 'default' : 'destructive'}
            className="slide-in-from-top animate-in duration-300"
          >
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <div className="flex-1">
                <span>
                  {isOffline
                    ? 'You are offline. Some features may not work.'
                    : error}
                </span>
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
            </AlertDescription>
          </Alert>
        )}

        {/* Timer Controls - Main Content */}
        <div className="space-y-6 pb-6">
          {/* Quick Stats Banner */}
          <div className="rounded-lg border border-blue-200/60 bg-gradient-to-r from-blue-50 to-blue-100/50 p-4 shadow-sm dark:border-blue-800/60 dark:from-blue-950/30 dark:to-blue-900/20">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20">
                <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-blue-700 text-sm dark:text-blue-300">
                    Today&apos;s Progress:
                  </p>
                  <span className="font-bold text-blue-900 text-sm dark:text-blue-100">
                    {formatDuration(timerStats.todayTime)}
                  </span>
                </div>
                <p className="text-blue-600/70 text-xs dark:text-blue-400/70">
                  {timerStats.streak > 0
                    ? `${timerStats.streak} day streak! Keep it up! 🔥`
                    : 'Start your streak today! 💪'}
                </p>
              </div>
            </div>
          </div>

          {/* Timer Controls */}
          {!isViewingOtherUser && (
            <div
              data-timer-controls
              className="fade-in-50 animate-in duration-300"
            >
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
                isDraggingTask={false}
                onGoToTasksTab={() => {
                  toast.success(
                    'Navigate to Tasks page to create your first task!'
                  );
                }}
                currentUserId={currentUserId}
              />
            </div>
          )}
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
                  Continue Last Session?
                </h3>
                <p className="text-gray-600 text-sm dark:text-gray-400">
                  Resume your previous work session
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
                Cancel
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

                    toast.success(`Resumed: "${recentSessions[0].title}"`);
                    setShowContinueConfirm(false);
                  } catch (error) {
                    console.error('Error resuming session:', error);
                    toast.error('Failed to resume session');
                  }
                }}
                className="flex-1"
              >
                Continue Session
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
                  Choose Your Next Task
                </h3>
                <p className="text-gray-600 text-sm dark:text-gray-400">
                  Tasks prioritized: Your urgent tasks → Urgent unassigned →
                  Your other tasks
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
                      No Tasks Available
                    </h4>
                    <p className="mb-4 text-gray-600 text-sm dark:text-gray-400">
                      You don&apos;t have any assigned tasks. Create a new task
                      or check available boards.
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
                        Create Task
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
                        View Boards
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
                      onClick={async () => {
                        try {
                          // If task is unassigned, assign to current user first
                          if (!task) return;
                          if (isUnassigned) {
                            const { createClient } = await import(
                              '@tuturuuu/supabase/next/client'
                            );
                            const supabase = createClient();

                            const { error: assignError } = await supabase
                              .from('task_assignees')
                              .insert({
                                task_id: task.id,
                                user_id: currentUserId,
                              });

                            if (assignError) {
                              console.error(
                                'Task assignment error:',
                                assignError
                              );
                              throw new Error(
                                assignError.message || 'Failed to assign task'
                              );
                            }

                            toast.success(
                              `Assigned "${task.name}" to yourself`
                            );
                          }

                          // Start session
                          const response = await apiCall(
                            `/api/v1/workspaces/${wsId}/time-tracking/sessions`,
                            {
                              method: 'POST',
                              body: JSON.stringify({
                                title: task.name,
                                description:
                                  task.description ||
                                  `Working on: ${task.name}`,
                                task_id: task.id,
                                category_id:
                                  categories.find((c) =>
                                    c.name.toLowerCase().includes('work')
                                  )?.id || null,
                              }),
                            }
                          );

                          setCurrentSession(response.session);
                          setIsRunning(true);
                          setElapsedTime(0);
                          await fetchData();

                          toast.success(`Started: ${task.name}`);
                          setShowTaskSelector(false);
                        } catch (error) {
                          console.error('Error starting task session:', error);
                          toast.error('Failed to start task session');
                        }
                      }}
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
                            {task.description}
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
                            {isUnassigned ? 'Unassigned' : 'Assigned to you'}
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
                Cancel
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
                    View All Tasks
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
