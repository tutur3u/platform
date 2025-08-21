'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  BarChart3,
  Calendar,
  Clock,
  FileText,
  History,
  RefreshCw,
  TrendingUp,
} from '@tuturuuu/ui/icons';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCurrentUser } from '../hooks/use-current-user';

export function ReportsContent() {
  const { userId: currentUserId, isLoading: isLoadingUser } = useCurrentUser();

  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleRefresh = useCallback(() => {
    setIsLoading(true);
    setLastRefresh(new Date());
    // Simulate loading for demo purposes
    setTimeout(() => {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }, 1000);
  }, []);

  if (isLoadingUser || !currentUserId) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="space-y-4 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
          <p className="animate-pulse text-muted-foreground text-sm">
            Loading reports...
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
      {/* Enhanced Header */}
      <div className="space-y-6">
        {/* Main Header Section */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-2xl tracking-tight sm:text-3xl">
                  Reports & Analytics
                </h1>
                <p className="text-muted-foreground text-sm sm:text-base">
                  Detailed insights and productivity reports 📊
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                <span>Coming soon</span>
              </div>
              <span>•</span>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                <span>Advanced analytics</span>
              </div>
            </div>

            {lastRefresh && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                <Clock className="h-3 w-3" />
                <span>Last updated: {lastRefresh.toLocaleTimeString()}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
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

        {/* Main Reports Content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Coming Soon Message */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border bg-gradient-to-br from-white to-gray-50/30 p-8 shadow-sm dark:border-gray-800/60 dark:bg-gray-950/50 dark:from-gray-950/80 dark:to-gray-900/60">
              <div className="text-center">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg">
                  <BarChart3 className="h-10 w-10 text-white" />
                </div>
                <h2 className="mb-4 font-bold text-2xl text-gray-900 dark:text-gray-100">
                  Advanced Reports Coming Soon
                </h2>
                <p className="mb-6 text-gray-600 text-lg dark:text-gray-400">
                  We&apos;re working on comprehensive reporting features to give
                  you deeper insights into your productivity patterns.
                </p>

                {/* Feature Preview Grid */}
                <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-950/30">
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/50">
                      <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <h3 className="mb-1 font-semibold text-purple-900 text-sm dark:text-purple-100">
                      Productivity Trends
                    </h3>
                    <p className="text-purple-700 text-xs dark:text-purple-300">
                      Track your productivity over time with detailed analytics
                    </p>
                  </div>

                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30">
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/50">
                      <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="mb-1 font-semibold text-blue-900 text-sm dark:text-blue-100">
                      Time Distribution
                    </h3>
                    <p className="text-blue-700 text-xs dark:text-blue-300">
                      See how you spend time across different categories and
                      projects
                    </p>
                  </div>

                  <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30">
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/50">
                      <FileText className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <h3 className="mb-1 font-semibold text-green-900 text-sm dark:text-green-100">
                      Custom Reports
                    </h3>
                    <p className="text-green-700 text-xs dark:text-green-300">
                      Generate custom reports for specific time periods and
                      metrics
                    </p>
                  </div>

                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950/30">
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/50">
                      <History className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <h3 className="mb-1 font-semibold text-orange-900 text-sm dark:text-orange-100">
                      Historical Analysis
                    </h3>
                    <p className="text-orange-700 text-xs dark:text-orange-300">
                      Compare performance across different time periods
                    </p>
                  </div>

                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/50">
                      <Clock className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <h3 className="mb-1 font-semibold text-red-900 text-sm dark:text-red-100">
                      Focus Metrics
                    </h3>
                    <p className="text-red-700 text-xs dark:text-red-300">
                      Measure your focus and deep work sessions
                    </p>
                  </div>

                  <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-950/30">
                    <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/50">
                      <BarChart3 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h3 className="mb-1 font-semibold text-indigo-900 text-sm dark:text-indigo-100">
                      Goal Tracking
                    </h3>
                    <p className="text-indigo-700 text-xs dark:text-indigo-300">
                      Monitor progress towards your time tracking goals
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border-2 border-muted-foreground/25 border-dashed bg-muted/30 p-6 dark:bg-muted/20">
                  <p className="text-muted-foreground text-sm">
                    🚀 Advanced reporting features are in development. Stay
                    tuned for detailed analytics, custom reports, and
                    productivity insights that will help you optimize your time
                    management.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
