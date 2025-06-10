'use client';

import { ActivityHeatmap } from './components/activity-heatmap';
import { CategoryManager } from './components/category-manager';
import { GoalManager } from './components/goal-manager';
import { SessionHistory } from './components/session-history';
import { StatsOverview } from './components/stats-overview';
import { TimerControls } from './components/timer-controls';
import { UserSelector } from './components/user-selector';
import { useCurrentUser } from './hooks/use-current-user';
import type {
  TimeTrackingCategory,
  TimeTrackingSession,
  WorkspaceTask,
} from '@tuturuuu/types/db';
import { Alert, AlertDescription } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  AlertCircle,
  Calendar,
  Clock,
  RefreshCw,
  Settings,
  Timer,
  TrendingUp,
  WifiOff,
} from '@tuturuuu/ui/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
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

interface ExtendedWorkspaceTask extends Partial<WorkspaceTask> {
  board_name?: string;
  list_name?: string;
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

        const promises = [
          apiCall(`/api/v1/workspaces/${wsId}/time-tracking/categories`),
          !isViewingOtherUser
            ? apiCall(
                `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running`
              )
            : Promise.resolve({ session: null }),
          apiCall(
            `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=recent&limit=50${userParam}`
          ),
          apiCall(
            `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=stats${userParam}`
          ),
          apiCall(
            `/api/v1/workspaces/${wsId}/time-tracking/goals${goalsUserParam}`
          ),
          apiCall(`/api/v1/workspaces/${wsId}/tasks?limit=100`),
        ];

        const [
          categoriesRes,
          runningRes,
          recentRes,
          statsRes,
          goalsRes,
          tasksRes,
        ] = await Promise.all(promises);

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
  }, [fetchData, isLoading, retryCount]);

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
  }, [fetchData]);

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
  }, [fetchData, retryCount]);

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
  }, [fetchData]);

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
      {/* Header with User Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Time Tracker
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            {isViewingOtherUser
              ? "Viewing another user's time tracking data"
              : 'Track and manage your time across projects'}
          </p>
          {!isViewingOtherUser && (
            <p className="text-xs text-muted-foreground">
              Week starts Monday • Times updated in real-time
              {(() => {
                const today = new Date();
                const dayOfWeek = today.getDay();

                if (dayOfWeek === 1) {
                  return ' • Week resets today! 🎯';
                } else if (dayOfWeek === 0) {
                  return ' • Week resets tomorrow';
                } else {
                  return ' • Week resets Monday';
                }
              })()}
            </p>
          )}
          {lastRefresh && (
            <p className="text-xs text-muted-foreground">
              Last updated: {lastRefresh.toLocaleTimeString()}
              {isOffline && (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                  <WifiOff className="h-3 w-3" />
                  Offline
                </span>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true, false)}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
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

      <StatsOverview timerStats={timerStats} formatDuration={formatDuration} />

      {timerStats.dailyActivity && (
        <ActivityHeatmap
          dailyActivity={timerStats.dailyActivity}
          formatDuration={formatDuration}
        />
      )}

      {/* Main Content Tabs with improved mobile design */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList
          className={cn(
            'grid w-full bg-muted/30 backdrop-blur-sm',
            isViewingOtherUser ? 'grid-cols-2' : 'grid-cols-4'
          )}
        >
          {!isViewingOtherUser && (
            <TabsTrigger
              value="timer"
              className="flex items-center gap-2 text-xs transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm sm:text-sm"
            >
              <Timer className="h-4 w-4" />
              <span className="hidden sm:inline">Timer</span>
            </TabsTrigger>
          )}
          <TabsTrigger
            value="history"
            className="flex items-center gap-2 text-xs transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm sm:text-sm"
          >
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
          {!isViewingOtherUser && (
            <TabsTrigger
              value="categories"
              className="flex items-center gap-2 text-xs transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm sm:text-sm"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Categories</span>
            </TabsTrigger>
          )}
          <TabsTrigger
            value="goals"
            className="flex items-center gap-2 text-xs transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm sm:text-sm"
          >
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Goals</span>
          </TabsTrigger>
        </TabsList>

        {!isViewingOtherUser && (
          <TabsContent
            value="timer"
            className="space-y-6 duration-300 animate-in fade-in-50"
          >
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
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
                />
              </div>
              <div>
                <Card className="h-fit">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Clock className="h-5 w-5" />
                      Recent Sessions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-[400px] space-y-3 overflow-y-auto">
                      {recentSessions.slice(0, 5).map((session, index) => (
                        <div
                          key={session.id}
                          className={cn(
                            'flex items-center justify-between rounded-lg border p-3 transition-all duration-300 animate-in slide-in-from-right hover:bg-accent/50 hover:shadow-sm'
                          )}
                          style={{ animationDelay: `${index * 50}ms` }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {session.title}
                            </p>
                            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                              {session.category && (
                                <span className="inline-flex items-center gap-1">
                                  <div className="h-2 w-2 rounded-full bg-primary"></div>
                                  {session.category.name}
                                </span>
                              )}
                              <span>•</span>
                              <span>
                                {new Date(
                                  session.start_time
                                ).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium">
                              {session.duration_seconds
                                ? formatDuration(session.duration_seconds)
                                : '-'}
                            </p>
                          </div>
                        </div>
                      ))}
                      {recentSessions.length === 0 && (
                        <div className="py-8 text-center">
                          <Clock className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            No sessions yet. Start your first timer!
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
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
                You're viewing another user's session history. You can see their
                sessions but cannot edit them.
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

        <TabsContent
          value="categories"
          className="duration-300 animate-in fade-in-50"
        >
          {isViewingOtherUser && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 duration-300 animate-in slide-in-from-top dark:border-blue-800 dark:bg-blue-950/30">
              <p className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                <Settings className="h-4 w-4" />
                You're viewing another user's categories. You can see their
                categories but cannot edit them.
              </p>
            </div>
          )}
          <CategoryManager
            wsId={wsId}
            categories={categories}
            onCategoriesUpdate={() => fetchData(false)}
            readOnly={isViewingOtherUser}
            apiCall={apiCall}
          />
        </TabsContent>

        <TabsContent
          value="goals"
          className="duration-300 animate-in fade-in-50"
        >
          {isViewingOtherUser && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 duration-300 animate-in slide-in-from-top dark:border-blue-800 dark:bg-blue-950/30">
              <p className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                <TrendingUp className="h-4 w-4" />
                You're viewing another user's goals. You can see their progress
                but cannot edit their goals.
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
  );
}
