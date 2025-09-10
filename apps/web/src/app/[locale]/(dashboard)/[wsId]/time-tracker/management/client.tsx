'use client';

import type { TimeTrackingSession } from '@tuturuuu/types/db';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { AlertCircle, Clock, Loader2 } from '@tuturuuu/ui/icons';
import { getInitials } from '@tuturuuu/utils/name-helper';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import FiltersPanel from './components/filters-panel';
import ManagementCardSkeleton from './components/management-card-skeleton';
import SessionsTable from './components/sessions-table';
import StatsOverview from './components/stats-overview';

// Extend dayjs with duration plugin
dayjs.extend(duration);

interface GroupedSession {
  title: string;
  category: {
    name: string;
    color: string;
  } | null;
  sessions: TimeTrackingSession[];
  totalDuration: number;
  firstStartTime: string;
  lastEndTime: string | null;
  status: 'active' | 'paused' | 'completed';
  user: {
    displayName: string | null;
    avatarUrl: string | null;
  };
  period: string;
  sessionCount?: number;
  sessionTitles?: string[];
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

interface TimeTrackingStats {
  totalSessions: number;
  activeSessions: number;
  activeUsers: number;
  todayTime: number;
  weekTime: number;
  monthTime: number;
  todaySessions: number;
  weekSessions: number;
  monthSessions: number;
  streak: number;
}

export default function TimeTrackerManagementClient({
  groupedSessions,
  pagination,
  stats,
  currentPeriod,
  currentStartDate,
  currentEndDate,
}: {
  groupedSessions: GroupedSession[];
  pagination?: PaginationInfo;
  stats?: TimeTrackingStats;
  currentPeriod?: 'day' | 'week' | 'month';
  currentStartDate?: string;
  currentEndDate?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period =
    currentPeriod ||
    (searchParams.get('period') as 'day' | 'week' | 'month') ||
    'day';

  const [searchQuery, setSearchQuery] = useState(
    searchParams.get('search') || ''
  );
  const [startDate, setStartDate] = useState(
    currentStartDate || searchParams.get('startDate') || ''
  );
  const [endDate, setEndDate] = useState(
    currentEndDate || searchParams.get('endDate') || ''
  );
  const [selectedSession, setSelectedSession] = useState<GroupedSession | null>(
    null
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loading and error management
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Navigation helper functions
  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams(searchParams);

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      router.push(`?${params.toString()}`);

      setTimeout(() => setIsLoading(false), 500);
    },
    [router, searchParams]
  );

  const handlePeriodChange = (newPeriod: 'day' | 'week' | 'month') => {
    updateSearchParams({ period: newPeriod, page: '1' });
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    updateSearchParams({ search: query || null, page: '1' });
  };

  const handleDateRangeChange = (newStartDate: string, newEndDate: string) => {
    setStartDate(newStartDate);
    setEndDate(newEndDate);
    updateSearchParams({
      startDate: newStartDate || null,
      endDate: newEndDate || null,
      page: '1',
    });
  };

  const handleStartDateChange = (date: string) => {
    setStartDate(date);
    updateSearchParams({ startDate: date || null, page: '1' });
  };

  const handleEndDateChange = (date: string) => {
    setEndDate(date);
    updateSearchParams({ endDate: date || null, page: '1' });
  };

  const handleClearDateFilters = () => {
    setStartDate('');
    setEndDate('');
    updateSearchParams({ startDate: null, endDate: null, page: '1' });
  };

  const handlePageChange = (newPage: number) => {
    updateSearchParams({ page: newPage.toString() });
  };

  const handleLimitChange = (newLimit: string) => {
    updateSearchParams({ limit: newLimit, page: '1' });
  };

  const handleViewDetails = (session: GroupedSession) => {
    setSelectedSession(session);
    setIsModalOpen(true);
  };

  // Use provided stats or calculate from grouped sessions
  const displayStats = stats || {
    totalSessions: groupedSessions.length,
    activeSessions: groupedSessions.filter((s) => s.status === 'active').length,
    activeUsers: Array.from(
      new Set(groupedSessions.map((s) => s.user.displayName))
    ).length,
    todayTime: 0,
    weekTime: 0,
    monthTime: 0,
    todaySessions: 0,
    weekSessions: 0,
    monthSessions: 0,
    streak: 0,
  };

  const hasActiveFilters = searchQuery || startDate || endDate;
  const clearAllFilters = () => {
    handleSearchChange('');
    handleClearDateFilters();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-6 rounded-xl border border-dynamic-border/20 bg-gradient-to-r from-dynamic-blue/5 via-dynamic-purple/5 to-dynamic-green/5 p-8">
        <div className="flex items-center justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-gradient-to-br from-dynamic-blue/20 to-dynamic-purple/20 p-3 ring-2 ring-dynamic-blue/10">
                <Clock className="size-8 text-dynamic-blue" />
              </div>
              <div>
                <h1 className="bg-gradient-to-r from-dynamic-blue to-dynamic-purple bg-clip-text font-bold text-3xl text-transparent">
                  Time Tracker Management
                </h1>
                <p className="mt-1 text-base text-dynamic-muted">
                  Monitor and analyze team productivity across time periods
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="overflow-hidden rounded-xl border border-dynamic-red/20 bg-gradient-to-r from-dynamic-red/10 to-dynamic-orange/10 p-6 transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-dynamic-red/20 p-2 ring-2 ring-dynamic-red/10">
              <AlertCircle className="size-5 text-dynamic-red" />
            </div>
            <div>
              <h4 className="font-semibold text-base text-dynamic-red">
                Error Loading Data
              </h4>
              <p className="mt-1 text-dynamic-red/80 text-sm">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="overflow-hidden rounded-xl border border-dynamic-blue/20 bg-gradient-to-r from-dynamic-blue/10 to-dynamic-purple/10 p-6 transition-all duration-300">
          <div className="flex items-center gap-4">
            <div className="rounded-lg bg-dynamic-blue/20 p-2 ring-2 ring-dynamic-blue/10">
              <Loader2 className="size-5 animate-spin text-dynamic-blue" />
            </div>
            <div>
              <span className="font-medium text-base text-dynamic-blue">
                Applying filters and loading data...
              </span>
              <p className="mt-1 text-dynamic-blue/80 text-sm">
                Please wait while we refresh your data
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Layout */}
      <div className="grid gap-6 pb-4">
        {/* Statistics Overview */}
        <Suspense fallback={<ManagementCardSkeleton />}>
          <StatsOverview
            stats={displayStats}
            period={period}
            groupedSessions={groupedSessions}
          />
        </Suspense>

        {/* Filters Panel */}
        <Suspense fallback={<ManagementCardSkeleton />}>
          <FiltersPanel
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={handleStartDateChange}
            onEndDateChange={handleEndDateChange}
            onClearDateFilters={handleClearDateFilters}
            period={period}
            onPeriodChange={handlePeriodChange}
            isLoading={isLoading}
            onDateRangeChange={handleDateRangeChange}
          />
        </Suspense>

        {/* Sessions Table */}
        <Suspense fallback={<ManagementCardSkeleton />}>
          <SessionsTable
            sessions={groupedSessions}
            pagination={pagination}
            period={period}
            onViewDetails={handleViewDetails}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
            isLoading={isLoading}
            hasActiveFilters={!!hasActiveFilters}
            onClearFilters={clearAllFilters}
          />
        </Suspense>
      </div>

      {/* Enhanced Session Details Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="flex h-[90vh] w-[95vw] max-w-2xl flex-col overflow-hidden sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl">
          <DialogHeader className="flex-shrink-0 border-dynamic-border/20 border-b pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full border border-dynamic-border/20 bg-dynamic-muted/10 sm:size-12">
                <span className="font-medium text-dynamic-foreground text-sm">
                  {getInitials(
                    selectedSession?.user.displayName || 'Unknown User'
                  )}
                </span>
              </div>
              <div>
                <DialogTitle className="text-dynamic-foreground text-lg sm:text-xl">
                  {selectedSession?.user.displayName || 'Unknown User'} - Time
                  Tracking Details
                </DialogTitle>
                <p className="text-dynamic-muted text-sm">
                  {selectedSession &&
                    `${selectedSession.sessions.length} sessions in ${period} period`}
                </p>
              </div>
            </div>
          </DialogHeader>

          {selectedSession && (
            <div className="flex-1 overflow-y-auto p-1">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4 text-center">
                    <div className="font-bold text-2xl text-dynamic-blue">
                      {selectedSession.sessions.length}
                    </div>
                    <div className="text-dynamic-muted text-sm">Sessions</div>
                  </div>

                  <div className="rounded-lg border border-dynamic-green/20 bg-dynamic-green/5 p-4 text-center">
                    <div className="font-bold text-2xl text-dynamic-green">
                      {dayjs
                        .duration(selectedSession.totalDuration, 'seconds')
                        .format('H:mm')}
                    </div>
                    <div className="text-dynamic-muted text-sm">Total Time</div>
                  </div>

                  <div className="rounded-lg border border-dynamic-yellow/20 bg-dynamic-yellow/5 p-4 text-center">
                    <div className="font-bold text-2xl text-dynamic-yellow">
                      {dayjs
                        .duration(
                          selectedSession.totalDuration /
                            selectedSession.sessions.length,
                          'seconds'
                        )
                        .format('H:mm')}
                    </div>
                    <div className="text-dynamic-muted text-sm">
                      Avg Session
                    </div>
                  </div>

                  <div className="rounded-lg border border-dynamic-purple/20 bg-dynamic-purple/5 p-4 text-center">
                    <div className="font-bold text-2xl text-dynamic-purple">
                      {
                        selectedSession.sessions.filter((s) => s.is_running)
                          .length
                      }
                    </div>
                    <div className="text-dynamic-muted text-sm">Active</div>
                  </div>
                </div>

                <div className="rounded-lg border border-dynamic-border/20 p-4">
                  <h4 className="mb-3 font-semibold text-dynamic-foreground">
                    Session List
                  </h4>
                  <div className="space-y-3">
                    {selectedSession.sessions
                      .sort(
                        (a, b) =>
                          new Date(b.start_time).getTime() -
                          new Date(a.start_time).getTime()
                      )
                      .map((session) => (
                        <div
                          key={session.id}
                          className="flex items-center justify-between rounded-md border border-dynamic-border/10 bg-dynamic-muted/5 p-3"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-dynamic-foreground">
                              {session.title || 'Untitled Session'}
                            </div>
                            <div className="text-dynamic-muted text-sm">
                              {dayjs(session.start_time).format(
                                'MMM D, YYYY HH:mm'
                              )}
                            </div>
                            {session.description && (
                              <div className="text-dynamic-muted text-sm">
                                {session.description}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-dynamic-foreground text-sm">
                              {session.duration_seconds
                                ? dayjs
                                    .duration(
                                      session.duration_seconds,
                                      'seconds'
                                    )
                                    .format('H:mm:ss')
                                : 'Running...'}
                            </div>
                            {session.is_running && (
                              <div className="flex items-center justify-end gap-1 text-dynamic-green text-xs">
                                <div className="size-2 animate-pulse rounded-full bg-dynamic-green" />
                                Active
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
