'use client';

import { CategoryManager } from './components/category-manager';
import { GoalManager } from './components/goal-manager';
import { SessionHistory } from './components/session-history';
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
  Zap,
} from '@tuturuuu/ui/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useState } from 'react';

interface TimeTrackerContentProps {
  wsId: string;
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
}

interface SessionWithRelations extends TimeTrackingSession {
  category?: TimeTrackingCategory;
  task?: WorkspaceTask;
}

interface TimeTrackingGoal {
  id: string;
  ws_id: string;
  user_id: string;
  category_id?: string;
  daily_goal_minutes: number;
  weekly_goal_minutes?: number;
  is_active: boolean;
  category?: TimeTrackingCategory;
}

export default function TimeTrackerContent({ wsId }: TimeTrackerContentProps) {
  const { userId: currentUserId, isLoading: isLoadingUser } = useCurrentUser();
  const [activeTab, setActiveTab] = useState('timer');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null); // null means "my time"
  const [currentSession, setCurrentSession] =
    useState<SessionWithRelations | null>(null);
  const [categories, setCategories] = useState<TimeTrackingCategory[]>([]);
  const [goals, setGoals] = useState<TimeTrackingGoal[]>([]);
  const [recentSessions, setRecentSessions] = useState<SessionWithRelations[]>(
    []
  );
  const [timerStats, setTimerStats] = useState<TimerStats>({
    todayTime: 0,
    weekTime: 0,
    monthTime: 0,
    streak: 0,
  });

  // Timer state (only for current user)
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [tasks, setTasks] = useState<Partial<WorkspaceTask>[]>([]);

  // Enhanced loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Whether we're viewing another user's data
  const isViewingOtherUser = selectedUserId !== null;

  // API call helper with enhanced error handling
  const apiCall = useCallback(
    async (url: string, options: RequestInit = {}) => {
      try {
        const response = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
          ...options,
        });

        if (!response.ok) {
          const error = await response
            .json()
            .catch(() => ({ error: 'Unknown error' }));
          throw new Error(error.error || `HTTP ${response.status}`);
        }

        return response.json();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Network error';
        console.error('API call failed:', message);
        throw new Error(message);
      }
    },
    []
  );

  // Fetch all data with enhanced error handling
  const fetchData = useCallback(
    async (showLoading = true) => {
      if (!currentUserId) return;

      if (showLoading) setIsLoading(true);
      setError(null);

      try {
        const userParam = selectedUserId ? `&userId=${selectedUserId}` : '';
        const goalsUserParam = selectedUserId
          ? `?userId=${selectedUserId}`
          : '';

        const promises = [
          apiCall(`/api/v1/workspaces/${wsId}/time-tracking/categories`),
          // Only fetch running session for current user (others can't have running sessions shown to us)
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
            const elapsed = Math.floor(
              (new Date().getTime() -
                new Date(runningRes.session.start_time).getTime()) /
                1000
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
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to load data';
        console.error('Error fetching time tracking data:', error);
        setError(message);
        toast.error(`Failed to load time tracking data: ${message}`);
      } finally {
        if (showLoading) setIsLoading(false);
      }
    },
    [wsId, apiCall, currentUserId, selectedUserId, isViewingOtherUser]
  );

  // Auto-refresh data every 30 seconds when not in background
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchData(false); // Silent refresh
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchData]);

  // Timer effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (isRunning && currentSession) {
      interval = setInterval(() => {
        const elapsed = Math.floor(
          (new Date().getTime() -
            new Date(currentSession.start_time).getTime()) /
            1000
        );
        setElapsedTime(elapsed);
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isRunning, currentSession]);

  // Load data on mount and when user changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle user selection change
  const handleUserChange = useCallback(
    (userId: string | null) => {
      setSelectedUserId(userId);
      // If switching to timer tab and viewing another user, switch to history
      if (userId !== null && activeTab === 'timer') {
        setActiveTab('history');
      }
    },
    [activeTab]
  );

  // Retry function for error recovery
  const handleRetry = useCallback(() => {
    fetchData();
  }, [fetchData]);

  // Format time display
  const formatTime = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Format duration for display
  const formatDuration = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }, []);

  if (isLoadingUser || !currentUserId) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <p className="mt-4 animate-pulse text-sm text-muted-foreground">
            Loading time tracker...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 duration-500 animate-in fade-in-50">
      {/* Header with User Selector */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Time Tracker</h1>
          <p className="text-muted-foreground">
            {isViewingOtherUser
              ? "Viewing another user's time tracking data"
              : 'Track and manage your time across projects'}
          </p>
          {lastRefresh && (
            <p className="text-xs text-muted-foreground">
              Last updated: {lastRefresh.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData()}
            disabled={isLoading}
            className="gap-2"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            Refresh
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

      {/* Error Alert */}
      {error && (
        <Alert
          variant="destructive"
          className="duration-300 animate-in slide-in-from-top"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="ml-4"
            >
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="space-y-4 rounded-lg border bg-card p-6 text-center shadow-lg">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
            <p className="text-sm text-muted-foreground">Loading data...</p>
          </div>
        </div>
      )}

      {/* Stats Overview with improved animations */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: Calendar,
            label: 'Today',
            value: formatDuration(timerStats.todayTime),
            color: 'text-blue-500',
            bg: 'from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/20',
          },
          {
            icon: TrendingUp,
            label: 'This Week',
            value: formatDuration(timerStats.weekTime),
            color: 'text-green-500',
            bg: 'from-green-50 to-green-100 dark:from-green-950/20 dark:to-green-900/20',
          },
          {
            icon: Zap,
            label: 'This Month',
            value: formatDuration(timerStats.monthTime),
            color: 'text-purple-500',
            bg: 'from-purple-50 to-purple-100 dark:from-purple-950/20 dark:to-purple-900/20',
          },
          {
            icon: Clock,
            label: 'Streak',
            value: `${timerStats.streak} days`,
            color: 'text-orange-500',
            bg: 'from-orange-50 to-orange-100 dark:from-orange-950/20 dark:to-orange-900/20',
          },
        ].map((stat, index) => (
          <Card
            key={stat.label}
            className={cn(
              'group cursor-pointer border-0 bg-gradient-to-br transition-all duration-300 hover:scale-105 hover:shadow-lg',
              stat.bg,
              'duration-500 animate-in slide-in-from-bottom'
            )}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    'rounded-full bg-white p-3 shadow-sm transition-transform group-hover:scale-110 dark:bg-gray-800'
                  )}
                >
                  <stat.icon className={cn('h-6 w-6', stat.color)} />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-bold transition-all group-hover:scale-105">
                    {stat.value}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Tabs with improved styling */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList
          className={cn(
            'grid w-full bg-muted/30 backdrop-blur-sm',
            isViewingOtherUser ? 'grid-cols-3' : 'grid-cols-4'
          )}
        >
          {!isViewingOtherUser && (
            <TabsTrigger
              value="timer"
              className="flex items-center gap-2 transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
            >
              <Timer className="h-4 w-4" />
              <span className="hidden sm:inline">Timer</span>
            </TabsTrigger>
          )}
          <TabsTrigger
            value="history"
            className="flex items-center gap-2 transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
          <TabsTrigger
            value="categories"
            className="flex items-center gap-2 transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Categories</span>
          </TabsTrigger>
          <TabsTrigger
            value="goals"
            className="flex items-center gap-2 transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm"
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
                  onSessionUpdate={fetchData}
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
            onSessionUpdate={fetchData}
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
            onCategoriesUpdate={fetchData}
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
            onGoalsUpdate={fetchData}
            readOnly={isViewingOtherUser}
            formatDuration={formatDuration}
            apiCall={apiCall}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
