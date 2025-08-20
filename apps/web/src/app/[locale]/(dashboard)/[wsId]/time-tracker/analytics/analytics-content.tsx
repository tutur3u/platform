'use client';

import { Button } from '@tuturuuu/ui/button';
import { Clock, RefreshCw, TrendingUp } from '@tuturuuu/ui/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { cn, formatDuration } from '@tuturuuu/utils/format';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityHeatmap } from '../components/activity-heatmap';
import { StatsOverview } from '../components/stats-overview';
import { YearSummaryStats } from '../components/year-summary-stats';
import { useCurrentUser } from '../hooks/use-current-user';
import type { TimerStats } from '../types';

interface AnalyticsContentProps {
  wsId?: string;
}

export function AnalyticsContent({ wsId: propWsId }: AnalyticsContentProps) {
  const { userId: currentUserId, isLoading: isLoadingUser } = useCurrentUser();
  const params = useParams();
  const wsId = propWsId || (params.wsId as string);

  const [timerStats, setTimerStats] = useState<TimerStats>({
    todayTime: 0,
    weekTime: 0,
    monthTime: 0,
    streak: 0,
  });

  // Enhanced loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [retryCount, setRetryCount] = useState(0);
  const isMountedRef = useRef(true);

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
        const userParam = '';
        const goalsUserParam = '';

        // Individual API calls with error handling for each
        const apiCalls = [
          {
            name: 'categories',
            call: () =>
              apiCall(`/api/v1/workspaces/${wsId}/time-tracking/categories`),
            fallback: { categories: [] },
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
        ];

        // Execute API calls with individual error handling
        const results = await Promise.allSettled(
          apiCalls.map(({ call }) => call())
        );

        // Process results with fallbacks for failed calls
        const [, , statsRes] = results.map((result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          } else {
            const { name, fallback } = apiCalls[index]!;
            console.warn(`API call for ${name} failed:`, result.reason);
            toast.error(
              `Failed to load ${name}: ${result.reason.message || 'Unknown error'}`
            );
            return fallback;
          }
        });

        if (!isMountedRef.current) return;

        setTimerStats(
          statsRes.stats || {
            todayTime: 0,
            weekTime: 0,
            monthTime: 0,
            streak: 0,
          }
        );

        setLastRefresh(new Date());
        setRetryCount(0);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        const message =
          error instanceof Error ? error.message : 'Failed to load data';
        console.error('Error fetching analytics data:', error);

        if (isMountedRef.current) {
          setError(message);
          setRetryCount((prev) => prev + 1);

          if (!isRetry) {
            toast.error(`Failed to load analytics data: ${message}`);
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
          <p className="animate-pulse text-muted-foreground text-sm">
            Loading analytics...
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
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-2xl tracking-tight sm:text-3xl">
                  Analytics Dashboard
                </h1>
                <p className="text-muted-foreground text-sm sm:text-base">
                  Track and analyze your productivity patterns
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                <span>Week starts Monday</span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                <span>Data updated in real-time</span>
              </div>
            </div>

            {lastRefresh && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
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

        {/* Main Analytics Content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Stats Overview */}
          <div className="lg:col-span-2">
            <StatsOverview
              timerStats={timerStats}
              formatDuration={formatDuration}
            />
          </div>

          {/* Activity Heatmap */}
          {timerStats.dailyActivity && (
            <div className="lg:col-span-2">
              <ActivityHeatmap
                dailyActivity={timerStats.dailyActivity}
                formatDuration={formatDuration}
              />
            </div>
          )}

          {/* Year Summary Stats */}
          <div className="lg:col-span-2">
            <YearSummaryStats
              dailyActivity={timerStats.dailyActivity || []}
              formatDuration={formatDuration}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
