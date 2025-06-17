'use client';

import { ActivityHeatmap } from './components/activity-heatmap';
import { CategoryManager } from './components/category-manager';
import { GoalManager } from './components/goal-manager';
import { SessionHistory } from './components/session-history';
import { TimerControls } from './components/timer-controls';
import { UserSelector } from './components/user-selector';
import { useCurrentUser } from './hooks/use-current-user';
import type { ExtendedWorkspaceTask, TaskSidebarFilters } from './types';
import {
  generateAssigneeInitials,
  getFilteredAndSortedSidebarTasks,
  useTaskCounts,
} from './utils';
import { useQuery } from '@tanstack/react-query';
import type {
  TimeTrackingCategory,
  TimeTrackingSession,
  WorkspaceTask,
} from '@tuturuuu/types/db';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  History,
  MapPin,
  Pause,
  RefreshCw,
  RotateCcw,
  Settings,
  Sparkles,
  Tag,
  Target,
  Timer,
  TrendingUp,
  WifiOff,
  Zap,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useRef, useState } from 'react';

interface TimeTrackerContentProps {
  wsId: string;
  initialData: TimeTrackerData;
}

interface TimerStats {
  todayTime: number;
  weekTime: number;
  monthTime: number;
  streak: number;
  categoryBreakdown?: {
    today: Record<string, number>;
    week: Record<string, number>;
    month: Record<string, number>;
  };
  dailyActivity?: Array<{
    date: string;
    duration: number;
    sessions: number;
  }>;
}

// Unified SessionWithRelations type that matches both TimerControls and SessionHistory expectations
export interface SessionWithRelations extends TimeTrackingSession {
  category: TimeTrackingCategory | null;
  task: WorkspaceTask | null;
}

// Unified TimeTrackingGoal type that matches GoalManager expectations
export interface TimeTrackingGoal {
  id: string;
  ws_id: string;
  user_id: string;
  category_id: string | null;
  daily_goal_minutes: number;
  weekly_goal_minutes: number | null;
  is_active: boolean | null;
  category: TimeTrackingCategory | null;
}

export interface TimeTrackerData {
  categories: TimeTrackingCategory[];
  runningSession: SessionWithRelations | null;
  recentSessions: SessionWithRelations[] | null;
  goals: TimeTrackingGoal[] | null;
  tasks: ExtendedWorkspaceTask[];
  stats: TimerStats;
}

export default function TimeTrackerContent({
  wsId,
  initialData,
}: TimeTrackerContentProps) {
  const { userId: currentUserId, isLoading: isLoadingUser } = useCurrentUser();
  const [activeTab, setActiveTab] = useState('timer');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

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
  const [goals, setGoals] = useState<TimeTrackingGoal[]>(
    initialData.goals || []
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
            (new Date().getTime() -
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
      (new Date().getTime() -
        new Date(initialData.runningSession.start_time).getTime()) /
        1000
    );
    return Math.max(0, elapsed); // Ensure non-negative
  });
  const [isRunning, setIsRunning] = useState(!!initialData.runningSession);
  const [tasks, setTasks] = useState<ExtendedWorkspaceTask[]>(
    initialData.tasks || []
  );

  // Enhanced loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [retryCount, setRetryCount] = useState(0);

  // Refs for cleanup
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const isMountedRef = useRef(true);

  // Whether we're viewing another user's data
  const isViewingOtherUser = selectedUserId !== null;

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
        const userParam = selectedUserId ? `&userId=${selectedUserId}` : '';
        const goalsUserParam = selectedUserId
          ? `?userId=${selectedUserId}`
          : '';

        // Individual API calls with error handling for each
        const apiCalls = [
          {
            name: 'categories',
            call: () => apiCall(`/api/v1/workspaces/${wsId}/time-tracking/categories`),
            fallback: { categories: [] }
          },
          {
            name: 'running',
            call: () => !isViewingOtherUser
              ? apiCall(`/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running`)
              : Promise.resolve({ session: null }),
            fallback: { session: null }
          },
          {
            name: 'recent',
            call: () => apiCall(`/api/v1/workspaces/${wsId}/time-tracking/sessions?type=recent&limit=50${userParam}`),
            fallback: { sessions: [] }
          },
          {
            name: 'stats',
            call: () => apiCall(`/api/v1/workspaces/${wsId}/time-tracking/sessions?type=stats${userParam}`),
            fallback: { stats: { todayTime: 0, weekTime: 0, monthTime: 0, streak: 0 } }
          },
          {
            name: 'goals',
            call: () => apiCall(`/api/v1/workspaces/${wsId}/time-tracking/goals${goalsUserParam}`),
            fallback: { goals: [] }
          },
          {
            name: 'tasks',
            call: () => apiCall(`/api/v1/workspaces/${wsId}/tasks?limit=100`),
            fallback: { tasks: [] }
          }
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
          statsRes,
          goalsRes,
          tasksRes,
        ] = results.map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            const { name, fallback } = apiCalls[index]!;
            console.warn(`API call for ${name} failed:`, result.reason);
            // Only show error toast for critical failures, not for tasks
            if (name !== 'tasks') {
              toast.error(`Failed to load ${name}: ${result.reason.message || 'Unknown error'}`);
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
        setGoals(goalsRes.goals || []);
        setTasks(tasksRes.tasks || []);

        // Only update timer state if we're viewing current user's data
        if (!isViewingOtherUser) {
          if (runningRes.session) {
            setCurrentSession(runningRes.session);
            setIsRunning(true);
            const elapsed = Math.max(
              0,
              Math.floor(
                (new Date().getTime() -
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

  // Auto-refresh with exponential backoff and visibility check
  useEffect(() => {
    const refreshInterval = Math.min(30000 * Math.pow(2, retryCount), 300000); // Max 5 minutes

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
  }, [isLoading, retryCount]); // Remove fetchData dependency

  // Timer effect with better cleanup
  useEffect(() => {
    if (isRunning && currentSession && !isViewingOtherUser) {
      timerIntervalRef.current = setInterval(() => {
        if (isMountedRef.current) {
          const elapsed = Math.max(
            0,
            Math.floor(
              (new Date().getTime() -
                new Date(currentSession.start_time).getTime()) /
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
  }, [wsId, currentUserId, selectedUserId]); // Only depend on actual values, not the function

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      if (retryCount > 0) {
        fetchData(false, true);
      }
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [retryCount]); // Remove fetchData dependency

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
  const handleUserChange = useCallback(
    (userId: string | null) => {
      setSelectedUserId(userId);
      if (userId !== null && activeTab === 'timer') {
        setActiveTab('history');
      }
    },
    [activeTab]
  );

  // Retry function with exponential backoff
  const handleRetry = useCallback(() => {
    fetchData(true, true);
  }, []); // Remove fetchData dependency

  // Quick Actions Carousel
  const [carouselView, setCarouselView] = useState(0);
  const [lastUserInteraction, setLastUserInteraction] = useState(Date.now());

  // Auto-advance carousel every 15 seconds (pauses when user interacts)
  useEffect(() => {
    const interval = setInterval(() => {
      const timeSinceLastInteraction = Date.now() - lastUserInteraction;
      if (timeSinceLastInteraction >= 15000) {
        // 15 seconds
        setCarouselView((prev) => (prev === 2 ? 0 : prev + 1));
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [lastUserInteraction]);

  // Sidebar View Switching
  const [sidebarView, setSidebarView] = useState<
    'analytics' | 'tasks' | 'reports' | 'settings'
  >('analytics');

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

  if (isLoadingUser || !currentUserId) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <p className="animate-pulse text-sm text-muted-foreground">
            Loading time tracker...
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
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
                <Timer className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Time Tracker
                </h1>
                <p className="text-sm text-muted-foreground sm:text-base">
                  {isViewingOtherUser
                    ? "Viewing another user's time tracking data"
                    : 'Track and manage your time across projects'}
                </p>
              </div>
            </div>

            {!isViewingOtherUser && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
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
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
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

        {/* Quick Actions Carousel */}
        {!isViewingOtherUser && (
          <div className="space-y-4">
            {/* Carousel Navigation */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCarouselView((prev) => (prev === 0 ? 2 : prev - 1));
                    setLastUserInteraction(Date.now());
                  }}
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <div className="flex items-center gap-1">
                  {[0, 1, 2].map((index) => (
                    <button
                      key={index}
                      onClick={() => {
                        setCarouselView(index);
                        setLastUserInteraction(Date.now());
                      }}
                      className={cn(
                        'h-2 w-2 rounded-full transition-all duration-200',
                        carouselView === index
                          ? 'w-6 bg-primary'
                          : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                      )}
                    />
                  ))}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCarouselView((prev) => (prev === 2 ? 0 : prev + 1));
                    setLastUserInteraction(Date.now());
                  }}
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="text-xs text-muted-foreground">
                {carouselView === 0 && 'Smart Quick Actions'}
                {carouselView === 1 && 'Context-Aware Dashboard'}
                {carouselView === 2 && 'Productivity Command Center'}
              </div>
            </div>

            {/* Carousel Content */}
            <div className="relative overflow-hidden">
              <div
                className="flex transition-transform duration-300 ease-in-out"
                style={{ transform: `translateX(-${carouselView * 100}%)` }}
              >
                {/* View 0: Smart Quick Actions */}
                <div className="w-full flex-shrink-0">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
                    {/* Continue Last Session */}
                    <button
                      onClick={async () => {
                        if (!recentSessions[0]) {
                          toast.info('No recent session to continue');
                          return;
                        }

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

                          // Update data
                          await fetchData();

                          toast.success(
                            `Resumed: "${recentSessions[0].title}"`
                          );
                        } catch (error) {
                          console.error('Error resuming session:', error);
                          toast.error('Failed to resume session');
                        }
                      }}
                      disabled={!recentSessions[0]}
                      className={cn(
                        'group rounded-lg border p-3 text-left transition-all duration-300',
                        recentSessions[0]
                          ? 'border-blue-200/60 bg-gradient-to-br from-blue-50 to-blue-100/50 hover:scale-105 hover:shadow-md dark:border-blue-800/60 dark:from-blue-950/30 dark:to-blue-900/20'
                          : 'cursor-not-allowed border-muted bg-muted/30 opacity-60'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className={cn(
                            'flex-shrink-0 rounded-full p-1.5',
                            recentSessions[0]
                              ? 'bg-blue-500/20'
                              : 'bg-muted-foreground/20'
                          )}
                        >
                          <RotateCcw
                            className={cn(
                              'h-3 w-3',
                              recentSessions[0]
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-muted-foreground'
                            )}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p
                            className={cn(
                              'text-xs font-medium',
                              recentSessions[0]
                                ? 'text-blue-700 dark:text-blue-300'
                                : 'text-muted-foreground'
                            )}
                          >
                            Continue Last
                          </p>
                          {recentSessions[0] ? (
                            <>
                              <p
                                className="line-clamp-2 text-sm font-bold text-blue-900 dark:text-blue-100"
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
                                  <span className="truncate text-xs text-blue-700/80 dark:text-blue-300/80">
                                    {recentSessions[0].category.name}
                                  </span>
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="text-sm font-bold text-muted-foreground">
                              No recent session
                            </p>
                          )}
                        </div>
                        <span className="flex-shrink-0 text-sm opacity-70">
                          {recentSessions[0] ? '🔄' : '💤'}
                        </span>
                      </div>
                    </button>

                    {/* Start Most Used Task */}
                    <button
                      onClick={() => {
                        // TODO: Implement start most used task
                        toast.info('Start most used task - Coming soon!');
                      }}
                      className="group rounded-lg border border-green-200/60 bg-gradient-to-br from-green-50 to-green-100/50 p-3 text-left transition-all duration-300 hover:scale-105 hover:shadow-md dark:border-green-800/60 dark:from-green-950/30 dark:to-green-900/20"
                    >
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-green-500/20 p-1.5">
                          <CheckCircle className="h-3 w-3 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-green-700 dark:text-green-300">
                            Most Used
                          </p>
                          <p className="text-sm font-bold text-green-900 dark:text-green-100">
                            Quick Start
                          </p>
                        </div>
                        <span className="text-sm opacity-70">⚡</span>
                      </div>
                    </button>

                    {/* Quick 25min Focus */}
                    <button
                      onClick={() => {
                        // TODO: Implement quick focus timer
                        toast.info('Quick 25min focus - Coming soon!');
                      }}
                      className="group rounded-lg border border-purple-200/60 bg-gradient-to-br from-purple-50 to-purple-100/50 p-3 text-left transition-all duration-300 hover:scale-105 hover:shadow-md dark:border-purple-800/60 dark:from-purple-950/30 dark:to-purple-900/20"
                    >
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-purple-500/20 p-1.5">
                          <Clock className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-purple-700 dark:text-purple-300">
                            Quick Focus
                          </p>
                          <p className="text-sm font-bold text-purple-900 dark:text-purple-100">
                            25 minutes
                          </p>
                        </div>
                        <span className="text-sm opacity-70">🎯</span>
                      </div>
                    </button>

                    {/* From Template */}
                    <button
                      onClick={() => {
                        // TODO: Implement template selection
                        toast.info('Start from template - Coming soon!');
                      }}
                      className="group rounded-lg border border-orange-200/60 bg-gradient-to-br from-orange-50 to-orange-100/50 p-3 text-left transition-all duration-300 hover:scale-105 hover:shadow-md dark:border-orange-800/60 dark:from-orange-950/30 dark:to-orange-900/20"
                    >
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-orange-500/20 p-1.5">
                          <Copy className="h-3 w-3 text-orange-600 dark:text-orange-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-orange-700 dark:text-orange-300">
                            Template
                          </p>
                          <p className="text-sm font-bold text-orange-900 dark:text-orange-100">
                            Quick Start
                          </p>
                        </div>
                        <span className="text-sm opacity-70">📋</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* View 1: Context-Aware Dashboard */}
                <div className="w-full flex-shrink-0">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
                    {/* Today's Calendar */}
                    <button
                      onClick={() => {
                        toast.info(
                          "Today's calendar integration - Coming soon!"
                        );
                      }}
                      className="group rounded-lg border border-indigo-200/60 bg-gradient-to-br from-indigo-50 to-indigo-100/50 p-3 text-left transition-all duration-300 hover:scale-105 hover:shadow-md dark:border-indigo-800/60 dark:from-indigo-950/30 dark:to-indigo-900/20"
                    >
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-indigo-500/20 p-1.5">
                          <Calendar className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
                            Calendar
                          </p>
                          <p className="text-sm font-bold text-indigo-900 dark:text-indigo-100">
                            Today's Events
                          </p>
                        </div>
                        <span className="text-sm opacity-70">📅</span>
                      </div>
                    </button>

                    {/* Suggested Tasks */}
                    <button
                      onClick={() => {
                        toast.info('AI task suggestions - Coming soon!');
                      }}
                      className="group rounded-lg border border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-3 text-left transition-all duration-300 hover:scale-105 hover:shadow-md dark:border-emerald-800/60 dark:from-emerald-950/30 dark:to-emerald-900/20"
                    >
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-emerald-500/20 p-1.5">
                          <Sparkles className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            Suggested
                          </p>
                          <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">
                            Smart Tasks
                          </p>
                        </div>
                        <span className="text-sm opacity-70">✨</span>
                      </div>
                    </button>

                    {/* Goal Progress */}
                    <button
                      onClick={() => {
                        setActiveTab('goals');
                      }}
                      className="group rounded-lg border border-rose-200/60 bg-gradient-to-br from-rose-50 to-rose-100/50 p-3 text-left transition-all duration-300 hover:scale-105 hover:shadow-md dark:border-rose-800/60 dark:from-rose-950/30 dark:to-rose-900/20"
                    >
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-rose-500/20 p-1.5">
                          <Target className="h-3 w-3 text-rose-600 dark:text-rose-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
                            Goals
                          </p>
                          <p className="text-sm font-bold text-rose-900 dark:text-rose-100">
                            View Progress
                          </p>
                        </div>
                        <span className="text-sm opacity-70">🎯</span>
                      </div>
                    </button>

                    {/* Quick Actions */}
                    <button
                      onClick={() => {
                        // Scroll to timer controls
                        document
                          .querySelector('[data-timer-controls]')
                          ?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="group rounded-lg border border-cyan-200/60 bg-gradient-to-br from-cyan-50 to-cyan-100/50 p-3 text-left transition-all duration-300 hover:scale-105 hover:shadow-md dark:border-cyan-800/60 dark:from-cyan-950/30 dark:to-cyan-900/20"
                    >
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-cyan-500/20 p-1.5">
                          <Zap className="h-3 w-3 text-cyan-600 dark:text-cyan-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-cyan-700 dark:text-cyan-300">
                            Quick
                          </p>
                          <p className="text-sm font-bold text-cyan-900 dark:text-cyan-100">
                            Start Timer
                          </p>
                        </div>
                        <span className="text-sm opacity-70">⚡</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* View 2: Productivity Command Center */}
                <div className="w-full flex-shrink-0">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
                    {/* Active Tasks */}
                    <button
                      onClick={() => {
                        toast.info('Active tasks view - Coming soon!');
                      }}
                      className="group rounded-lg border border-violet-200/60 bg-gradient-to-br from-violet-50 to-violet-100/50 p-3 text-left transition-all duration-300 hover:scale-105 hover:shadow-md dark:border-violet-800/60 dark:from-violet-950/30 dark:to-violet-900/20"
                    >
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-violet-500/20 p-1.5">
                          <CheckCircle className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-violet-700 dark:text-violet-300">
                            Active
                          </p>
                          <p className="text-sm font-bold text-violet-900 dark:text-violet-100">
                            {tasks.length} Tasks
                          </p>
                        </div>
                        <span className="text-sm opacity-70">📋</span>
                      </div>
                    </button>

                    {/* Focus Score */}
                    <button
                      onClick={() => {
                        toast.info('Focus score analytics - Coming soon!');
                      }}
                      className="group rounded-lg border border-amber-200/60 bg-gradient-to-br from-amber-50 to-amber-100/50 p-3 text-left transition-all duration-300 hover:scale-105 hover:shadow-md dark:border-amber-800/60 dark:from-amber-950/30 dark:to-amber-900/20"
                    >
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-amber-500/20 p-1.5">
                          <TrendingUp className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
                            Focus
                          </p>
                          <p className="text-sm font-bold text-amber-900 dark:text-amber-100">
                            Score: 85%
                          </p>
                        </div>
                        <span className="text-sm opacity-70">🧠</span>
                      </div>
                    </button>

                    {/* Break Timer */}
                    <button
                      onClick={() => {
                        toast.info('Break timer - Coming soon!');
                      }}
                      className="group rounded-lg border border-teal-200/60 bg-gradient-to-br from-teal-50 to-teal-100/50 p-3 text-left transition-all duration-300 hover:scale-105 hover:shadow-md dark:border-teal-800/60 dark:from-teal-950/30 dark:to-teal-900/20"
                    >
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-teal-500/20 p-1.5">
                          <Pause className="h-3 w-3 text-teal-600 dark:text-teal-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-teal-700 dark:text-teal-300">
                            Break
                          </p>
                          <p className="text-sm font-bold text-teal-900 dark:text-teal-100">
                            Take 5min
                          </p>
                        </div>
                        <span className="text-sm opacity-70">☕</span>
                      </div>
                    </button>

                    {/* Session History */}
                    <button
                      onClick={() => {
                        setActiveTab('history');
                      }}
                      className="group rounded-lg border border-slate-200/60 bg-gradient-to-br from-slate-50 to-slate-100/50 p-3 text-left transition-all duration-300 hover:scale-105 hover:shadow-md dark:border-slate-800/60 dark:from-slate-950/30 dark:to-slate-900/20"
                    >
                      <div className="flex items-center gap-2">
                        <div className="rounded-full bg-slate-500/20 p-1.5">
                          <History className="h-3 w-3 text-slate-600 dark:text-slate-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            History
                          </p>
                          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            View All
                          </p>
                        </div>
                        <span className="text-sm opacity-70">📊</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
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
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">
                    Currently tracking:
                  </p>
                  <span className="text-sm font-bold text-red-900 dark:text-red-100">
                    {currentSession.title}
                  </span>
                </div>
                <p className="text-xs text-red-600/70 dark:text-red-400/70">
                  Started at{' '}
                  {new Date(currentSession.start_time).toLocaleTimeString()} •
                  Running for {formatTime(elapsedTime)}
                </p>
              </div>
              <div className="font-mono text-lg font-bold text-red-600 dark:text-red-400">
                {formatTime(elapsedTime)}
              </div>
            </div>
          </div>
        )}

        {/* Error Alert with better UX */}
        {error && (
          <Alert
            variant={isOffline ? 'default' : 'destructive'}
            className="duration-300 animate-in slide-in-from-top"
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

        {/* New Layout: Analytics sidebar on left, Timer controls and tabs on right */}
        <div className="grid grid-cols-1 gap-6 pb-6 lg:grid-cols-5 lg:items-start">
          {/* Right Side: Tabs with Timer Controls - First on mobile */}
          <div className="order-1 lg:order-2 lg:col-span-3">
            <div className="space-y-6">
              {/* Tab Navigation - Styled like sidebar switcher */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
                  {!isViewingOtherUser && (
                    <button
                      onClick={() => setActiveTab('timer')}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                        activeTab === 'timer'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Timer className="h-3 w-3" />
                      Timer
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTab('history')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                      activeTab === 'history'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Clock className="h-3 w-3" />
                    History
                  </button>
                  {!isViewingOtherUser && (
                    <button
                      onClick={() => setActiveTab('categories')}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                        activeTab === 'categories'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Settings className="h-3 w-3" />
                      Categories
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTab('goals')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                      activeTab === 'goals'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <TrendingUp className="h-3 w-3" />
                    Goals
                  </button>
                </div>
              </div>

              {/* Main Tabs - Timer, History, Categories, Goals */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                {/* Tab Content */}
                {!isViewingOtherUser && (
                  <TabsContent
                    value="timer"
                    className="duration-300 animate-in fade-in-50"
                  >
                    <div data-timer-controls>
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
                        onGoToTasksTab={() => {
                          setSidebarView('tasks');
                          toast.success(
                            'Switched to Tasks tab - create your first task!'
                          );
                        }}
                      />
                    </div>
                  </TabsContent>
                )}

                <TabsContent
                  value="history"
                  className="duration-300 animate-in fade-in-50"
                >
                  {isViewingOtherUser && (
                    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 duration-300 animate-in slide-in-from-top dark:border-blue-800 dark:bg-blue-950/30">
                      <p className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                        <Calendar className="h-4 w-4" />
                        You're viewing another user's session history. You can
                        see their sessions but cannot edit them.
                      </p>
                    </div>
                  )}
                  <SessionHistory
                    wsId={wsId}
                    sessions={recentSessions}
                    categories={categories}
                    tasks={tasks}
                    onSessionUpdate={() => fetchData(false)}
                    readOnly={isViewingOtherUser}
                    formatDuration={formatDuration}
                    apiCall={apiCall}
                  />
                </TabsContent>

                {!isViewingOtherUser && (
                  <TabsContent
                    value="categories"
                    className="duration-300 animate-in fade-in-50"
                  >
                    <CategoryManager
                      wsId={wsId}
                      categories={categories}
                      onCategoriesUpdate={() => fetchData(false)}
                      readOnly={isViewingOtherUser}
                      apiCall={apiCall}
                    />
                  </TabsContent>
                )}

                <TabsContent
                  value="goals"
                  className="duration-300 animate-in fade-in-50"
                >
                  {isViewingOtherUser && (
                    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 duration-300 animate-in slide-in-from-top dark:border-blue-800 dark:bg-blue-950/30">
                      <p className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                        <TrendingUp className="h-4 w-4" />
                        You're viewing another user's goals. You can see their
                        progress but cannot edit their goals.
                      </p>
                    </div>
                  )}
                  <GoalManager
                    wsId={wsId}
                    goals={goals}
                    categories={categories}
                    timerStats={timerStats}
                    onGoalsUpdate={() => fetchData(false)}
                    readOnly={isViewingOtherUser}
                    formatDuration={formatDuration}
                    apiCall={apiCall}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* Left Side: Switchable Sidebar Views - Second on mobile */}
          <div className="order-2 lg:order-1 lg:col-span-2">
            <div className="space-y-6">
              {/* Sidebar View Switcher */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
                  <button
                    onClick={() => setSidebarView('analytics')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                      sidebarView === 'analytics'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <TrendingUp className="h-3 w-3" />
                    Analytics
                  </button>
                  {!isViewingOtherUser && (
                    <button
                      onClick={() => setSidebarView('tasks')}
                      className={cn(
                        'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                        sidebarView === 'tasks'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <CheckCircle className="h-3 w-3" />
                      Tasks
                    </button>
                  )}
                  <button
                    onClick={() => setSidebarView('reports')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                      sidebarView === 'reports'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <History className="h-3 w-3" />
                    Reports
                  </button>
                  <button
                    onClick={() => setSidebarView('settings')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all',
                      sidebarView === 'settings'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Settings className="h-3 w-3" />
                    Settings
                  </button>
                </div>
              </div>

              {/* Sidebar Content */}
              {sidebarView === 'analytics' && (
                <>
                  {/* Stats Overview - Enhanced for sidebar */}
                  <div className="rounded-xl border border-gray-200/60 bg-gradient-to-br from-white to-gray-50/30 p-4 shadow-sm sm:p-6 dark:border-gray-800/60 dark:bg-gray-950/50 dark:from-gray-950/80 dark:to-gray-900/60">
                    <div className="mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
                          <TrendingUp className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-100">
                            Your Progress
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Track your productivity metrics ⚡
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Custom sidebar-optimized stats layout */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {/* Today */}
                      <div className="rounded-lg border border-dynamic-blue/30 bg-background p-3 transition-all duration-300 hover:shadow-md">
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-dynamic-blue/10 p-2 shadow-sm">
                            <Calendar className="h-4 w-4 text-blue-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                Today
                              </p>
                              <span className="text-sm">
                                {new Date().getDay() === 0 ||
                                new Date().getDay() === 6
                                  ? '🏖️'
                                  : '💼'}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground/80">
                              {new Date().toLocaleDateString('en-US', {
                                weekday: 'long',
                              })}
                            </p>
                            <p className="text-lg font-bold">
                              {formatDuration(timerStats.todayTime)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* This Week */}
                      <div className="rounded-lg border border-dynamic-green/30 bg-background p-3 transition-all duration-300 hover:shadow-md">
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-dynamic-green/10 p-2 shadow-sm">
                            <TrendingUp className="h-4 w-4 text-green-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                This Week
                              </p>
                              <span className="text-sm">📊</span>
                            </div>
                            <p className="text-xs text-muted-foreground/80">
                              {(() => {
                                const today = new Date();
                                const dayOfWeek = today.getDay();
                                const daysToSubtract =
                                  dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                                const startOfWeek = new Date(today);
                                startOfWeek.setDate(
                                  today.getDate() - daysToSubtract
                                );
                                const endOfWeek = new Date(startOfWeek);
                                endOfWeek.setDate(startOfWeek.getDate() + 6);
                                return `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                              })()}
                            </p>
                            <p className="text-lg font-bold">
                              {formatDuration(timerStats.weekTime)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* This Month */}
                      <div className="rounded-lg border border-dynamic-purple/30 bg-background p-3 transition-all duration-300 hover:shadow-md">
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-dynamic-purple/10 p-2 shadow-sm">
                            <Zap className="h-4 w-4 text-purple-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                This Month
                              </p>
                              <span className="text-sm">🚀</span>
                            </div>
                            <p className="text-xs text-muted-foreground/80">
                              {new Date().toLocaleDateString('en-US', {
                                month: 'long',
                                year: 'numeric',
                              })}
                            </p>
                            <p className="text-lg font-bold">
                              {formatDuration(timerStats.monthTime)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Streak */}
                      <div className="rounded-lg border border-dynamic-orange/30 bg-background p-3 transition-all duration-300 hover:shadow-md">
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-dynamic-orange/10 p-2 shadow-sm">
                            <Clock className="h-4 w-4 text-orange-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                Streak
                              </p>
                              <span className="text-sm">
                                {timerStats.streak >= 7 ? '🏆' : '⭐'}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground/80">
                              {timerStats.streak > 0
                                ? 'consecutive days'
                                : 'start today!'}
                            </p>
                            <p className="text-lg font-bold">
                              {timerStats.streak} days
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Activity Heatmap - Enhanced with better header */}
                  {timerStats.dailyActivity && (
                    <div className="rounded-xl border border-gray-200/60 bg-background/50 p-4 shadow-sm sm:p-6 dark:border-gray-800/60 dark:bg-background/80">
                      <div className="mb-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
                            <Calendar className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-100">
                              Activity Heatmap
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {(() => {
                                const totalDuration =
                                  timerStats.dailyActivity?.reduce(
                                    (sum, day) => sum + day.duration,
                                    0
                                  ) || 0;
                                return totalDuration > 0
                                  ? `${formatDuration(totalDuration)} tracked this year 🔥`
                                  : 'Start tracking to see your activity pattern 🌱';
                              })()}
                            </p>
                          </div>
                        </div>
                      </div>
                      {/* Remove the original header from ActivityHeatmap component */}
                      <div className="[&>div>div:first-child]:hidden">
                        <ActivityHeatmap
                          dailyActivity={timerStats.dailyActivity}
                          formatDuration={formatDuration}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Tasks View */}
              {sidebarView === 'tasks' && (
                <div className="space-y-6">
                  {/* Tasks Header */}
                  <div className="rounded-xl border border-gray-200/60 bg-gradient-to-br from-white to-gray-50/30 p-6 shadow-sm dark:border-gray-800/60 dark:bg-gray-950/50 dark:from-gray-950/80 dark:to-gray-900/60">
                    {/* Header Section */}
                    <div className="mb-6">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
                          <CheckCircle className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-100">
                            Task Workspace
                          </h3>
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                            Drag tasks to timer to start tracking 🎯
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Enhanced Search and Filter Bar */}
                    <div className="mb-5 space-y-4">
                      {/* Quick Filter Buttons */}
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() =>
                            setTasksSidebarFilters((prev) => ({
                              ...prev,
                              assignee:
                                prev.assignee === 'mine' ? 'all' : 'mine',
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
                          onClick={() =>
                            setTasksSidebarFilters((prev) => ({
                              ...prev,
                              assignee:
                                prev.assignee === 'unassigned'
                                  ? 'all'
                                  : 'unassigned',
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
                          >
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
                            onChange={(e) =>
                              setTasksSidebarSearch(e.target.value)
                            }
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
                                  .filter((name): name is string =>
                                    Boolean(name)
                                  )
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
                                  .filter((name): name is string =>
                                    Boolean(name)
                                  )
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
                              Search: "{tasksSidebarSearch}"
                              <button
                                onClick={() => setTasksSidebarSearch('')}
                                className="hover:text-blue-900 dark:hover:text-blue-100"
                              >
                                ×
                              </button>
                            </span>
                          )}
                          {tasksSidebarFilters.board !== 'all' && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">
                              Board: {tasksSidebarFilters.board}
                              <button
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
                            <span className="inline-flex items-center gap-1 rounded-md bg-purple-100 px-2 py-1 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                              List: {tasksSidebarFilters.list}
                              <button
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
                            <span className="inline-flex items-center gap-1 rounded-md bg-orange-100 px-2 py-1 text-xs text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                              {tasksSidebarFilters.assignee === 'mine'
                                ? 'My Tasks'
                                : tasksSidebarFilters.assignee === 'unassigned'
                                  ? 'Unassigned'
                                  : 'Assignee Filter'}
                              <button
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
                            onClick={() => {
                              setTasksSidebarSearch('');
                              setTasksSidebarFilters({
                                board: 'all',
                                list: 'all',
                                assignee: 'all',
                              });
                            }}
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            Clear all
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Task List with Scrollable Container */}
                    <div className="space-y-4">
                      {(() => {
                        // Filter and sort tasks for sidebar with user prioritization
                        const filteredSidebarTasks =
                          getFilteredAndSortedSidebarTasks(
                            tasks,
                            tasksSidebarSearch,
                            tasksSidebarFilters
                          );

                        if (tasks.length === 0) {
                          return (
                            <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center">
                              <CheckCircle className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                              <p className="text-sm text-muted-foreground">
                                No tasks available. Create tasks in your project
                                boards to see them here.
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
                                {filteredSidebarTasks.length !== 1
                                  ? 's'
                                  : ''}{' '}
                                available
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
                            <div className="max-h-[400px] overflow-y-auto rounded-lg border border-gray-200/40 bg-gray-50/30 p-4 dark:border-gray-700/40 dark:bg-gray-800/20">
                              <div className="space-y-4">
                                {filteredSidebarTasks.map((task) => (
                                  <div
                                    key={task.id}
                                    className={cn(
                                      'group cursor-grab rounded-lg border p-4 shadow-sm transition-all duration-200 hover:scale-[1.01] hover:shadow-md active:cursor-grabbing',
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
                                        {task.assignees &&
                                          task.assignees.length > 0 && (
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
                                                        <img
                                                          src={
                                                            assignee.avatar_url
                                                          }
                                                          alt={
                                                            assignee.display_name ||
                                                            assignee.email ||
                                                            ''
                                                          }
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
                                        <span className="font-medium">
                                          Drag
                                        </span>
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
                                  <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
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
                  </div>
                </div>
              )}

              {/* Reports View */}
              {sidebarView === 'reports' && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-gray-200/60 bg-gradient-to-br from-white to-gray-50/30 p-4 shadow-sm sm:p-6 dark:border-gray-800/60 dark:bg-gray-950/50 dark:from-gray-950/80 dark:to-gray-900/60">
                    <div className="mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg">
                          <History className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-100">
                            Reports & Analytics
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Detailed insights coming soon 📊
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center">
                      <History className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Advanced reporting features are coming soon. Stay tuned
                        for detailed analytics, custom reports, and productivity
                        insights.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Settings View */}
              {sidebarView === 'settings' && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-gray-200/60 bg-gradient-to-br from-white to-gray-50/30 p-4 shadow-sm sm:p-6 dark:border-gray-800/60 dark:bg-gray-950/50 dark:from-gray-950/80 dark:to-gray-900/60">
                    <div className="mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-gray-500 to-gray-700 shadow-lg">
                          <Settings className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 sm:text-xl dark:text-gray-100">
                            Timer Settings
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Customize your tracking experience ⚙️
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center">
                      <Settings className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Timer settings and preferences will be available here.
                        Configure notifications, default categories, and more.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
