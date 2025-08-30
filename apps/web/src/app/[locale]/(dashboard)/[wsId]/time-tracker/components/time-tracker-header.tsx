'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { TimeTrackingCategory } from '@tuturuuu/types/db';
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
  BarChart2,
  CheckSquare,
  Pause,
  RefreshCw,
  RotateCcw,
  Timer,
} from '@tuturuuu/ui/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { priorityCompare } from '@/lib/task-helper';
import type {
  ExtendedWorkspaceTask,
  SessionWithRelations,
  TimeTrackerData,
} from '../types';

dayjs.extend(utc);
dayjs.extend(timezone);

interface TimeTrackerHeaderProps {
  wsId: string;
  initialData: TimeTrackerData;
}

export default function TimeTrackerHeader({
  wsId,
  initialData,
}: TimeTrackerHeaderProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const getUser = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setCurrentUserId(user?.id || null);
      } catch (error) {
        console.error('Error getting current user:', error);
        setCurrentUserId(null);
      }
    };

    getUser();
  }, []);

  const [currentSession, setCurrentSession] =
    useState<SessionWithRelations | null>(initialData.runningSession);
  const [categories, setCategories] = useState<TimeTrackingCategory[]>(
    initialData.categories || []
  );
  const [recentSessions, setRecentSessions] = useState<SessionWithRelations[]>(
    initialData.recentSessions || []
  );

  const [elapsedTime, setElapsedTime] = useState(() => {
    if (!initialData.runningSession) return 0;
    const elapsed = Math.floor(
      (Date.now() - new Date(initialData.runningSession.start_time).getTime()) /
        1000
    );
    return Math.max(0, elapsed);
  });
  const [isRunning, setIsRunning] = useState(!!initialData.runningSession);

  const [nextTaskPreview, setNextTaskPreview] =
    useState<ExtendedWorkspaceTask | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Refs for cleanup
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  // Get user timezone
  const userTimezone = dayjs.tz.guess();

  // Calculate focus score for sessions
  const calculateFocusScore = useCallback(
    (session: SessionWithRelations): number => {
      if (!session.duration_seconds) return 0;

      const durationScore = Math.min(session.duration_seconds / 7200, 1) * 40;
      const consistencyBonus = session.description?.includes('resumed')
        ? 0
        : 20;
      const sessionHour = dayjs.utc(session.start_time).tz(userTimezone).hour();
      const peakHoursBonus =
        (sessionHour >= 9 && sessionHour <= 11) ||
        (sessionHour >= 14 && sessionHour <= 16)
          ? 20
          : 0;
      const categoryBonus = session.category?.name
        ?.toLowerCase()
        .includes('work')
        ? 10
        : 0;
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

  // Calculate productivity metrics
  const productivityMetrics = useMemo(() => {
    if (!recentSessions.length) {
      return { avgFocusScore: 0, todaySessionCount: 0 };
    }

    const today = dayjs().tz(userTimezone);
    const todaySessions = recentSessions.filter((session) => {
      const sessionDate = dayjs.utc(session.start_time).tz(userTimezone);
      return sessionDate.isSame(today, 'day');
    });

    const focusScores = recentSessions
      .slice(0, 10)
      .map((session) => calculateFocusScore(session));
    const avgFocusScore =
      focusScores.length > 0
        ? Math.round(
            focusScores.reduce((sum, score) => sum + score, 0) /
              focusScores.length
          )
        : 0;

    return { avgFocusScore, todaySessionCount: todaySessions.length };
  }, [recentSessions, calculateFocusScore, userTimezone]);

  // API call helper
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

        setIsOffline(false);
        setRetryCount(0);
        return response.json();
      } catch (err) {
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

  // Function to fetch next task preview
  const fetchNextTaskPreview = useCallback(async () => {
    try {
      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/tasks?limit=100`
      );

      const myUrgentTasks = response.tasks.filter(
        (task: ExtendedWorkspaceTask) =>
          task.priority === 'critical' &&
          !task.completed &&
          task.is_assigned_to_current_user
      );

      const urgentUnassigned = response.tasks.filter(
        (task: ExtendedWorkspaceTask) =>
          task.priority === 'critical' &&
          !task.completed &&
          (!task.assignees || task.assignees.length === 0)
      );

      const myOtherTasks = response.tasks.filter(
        (task: ExtendedWorkspaceTask) =>
          (!task.priority || task.priority !== 'critical') &&
          !task.completed &&
          task.is_assigned_to_current_user
      );

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

      setNextTaskPreview(prioritizedTasks[0] || null);
    } catch (error) {
      console.error('Error fetching next tasks:', error);
      setNextTaskPreview(null);
    }
  }, [wsId, apiCall]);

  // Format time helper
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

  // Fetch data function
  const fetchData = useCallback(
    async (showLoading = true, isRetry = false) => {
      if (!currentUserId || !isMountedRef.current) return;

      if (showLoading && !isRetry) setIsLoading(true);
      setError(null);

      try {
        const userParam = currentUserId ? `&userId=${currentUserId}` : '';

        const [categoriesRes, runningRes, recentRes] = await Promise.allSettled(
          [
            apiCall(`/api/v1/workspaces/${wsId}/time-tracking/categories`),
            apiCall(
              `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=running`
            ),
            apiCall(
              `/api/v1/workspaces/${wsId}/time-tracking/sessions?type=recent&limit=50${userParam}`
            ),
          ]
        );

        if (!isMountedRef.current) return;

        if (categoriesRes.status === 'fulfilled') {
          setCategories(categoriesRes.value.categories || []);
        }
        if (recentRes.status === 'fulfilled') {
          setRecentSessions(recentRes.value.sessions || []);
        }

        if (runningRes.status === 'fulfilled' && runningRes.value.session) {
          setCurrentSession(runningRes.value.session);
          setIsRunning(true);
          const elapsed = Math.max(
            0,
            Math.floor(
              (Date.now() -
                new Date(runningRes.value.session.start_time).getTime()) /
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
    [wsId, apiCall, currentUserId]
  );

  const handleStartTask = useCallback(async () => {
    try {
      if (!nextTaskPreview) {
        toast.info('No tasks available. Please create or assign tasks first.');
        return;
      }

      const task = nextTaskPreview;

      if (!task || !currentUserId) return;

      const isUnassigned =
        !task || !task.assignees || task.assignees.length === 0;

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

        toast.success(`Assigned task "${task.name}" to yourself`);
      }

      const response = await apiCall(
        `/api/v1/workspaces/${wsId}/time-tracking/sessions`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: task.name,
            description: task.description || `Working on: ${task.name}`,
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

      toast.success(`Started: ${task.name}`);
    } catch (error) {
      console.error('Error starting task:', error);
      toast.error('Failed to start task session');
    }
  }, [nextTaskPreview, currentUserId, categories, fetchData, apiCall, wsId]);

  // Retry function
  const handleRetry = useCallback(() => {
    fetchData(true, true);
  }, [fetchData]);

  // Effects
  useEffect(() => {
    fetchNextTaskPreview();
  }, [fetchNextTaskPreview]);

  // Timer effect
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
  }, [retryCount, fetchData]); // Remove fetchData dependency

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  if (!currentUserId) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <p className="animate-pulse text-muted-foreground text-sm">
            Loading header...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
                Track and manage your time across projects
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
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
        </div>
      </div>

      {/* Enhanced Quick Actions - Single Row */}
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
            {/* Action Grid */}
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
                  // TODO: Implement continue session dialog
                  toast.info('Continue session feature coming soon!');
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
                onClick={handleStartTask}
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

              {/* Analytics Dashboard */}
              <button
                type="button"
                className="group hover:-translate-y-1 relative rounded-lg border border-amber-200/60 bg-gradient-to-br from-amber-50 to-amber-100/50 p-3 text-left transition-all duration-300 hover:shadow-amber-500/20 hover:shadow-lg active:scale-[0.98] dark:border-amber-800/60 dark:from-amber-950/30 dark:to-amber-900/20"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0 rounded-full bg-amber-500/20 p-1.5 transition-colors group-hover:bg-amber-500/30">
                    <BarChart2 className="h-3 w-3 text-amber-600 transition-transform group-hover:scale-110 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-amber-700 text-xs dark:text-amber-300">
                      Analytics
                    </p>
                    <p className="font-bold text-amber-900 text-sm dark:text-amber-100">
                      Focus: {productivityMetrics.avgFocusScore}%
                    </p>
                    <p className="text-amber-600/80 text-xs dark:text-amber-400/80">
                      {productivityMetrics.todaySessionCount} sessions today
                    </p>
                  </div>
                </div>
                <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="text-lg">📊</span>
                </div>
              </button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Current Session Status Banner */}
      {currentSession && (
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

      {/* Error Alert */}
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
    </div>
  );
}
