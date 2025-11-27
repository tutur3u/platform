'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import ExportProgressDialog from './components/export-progress-dialog';
import FiltersPanel from './components/filters-panel';
import ManagementCardSkeleton from './components/management-card-skeleton';
import ManagementHeader from './components/management-header';
import SessionDetailsModal from './components/session-details-modal';
import SessionsTable from './components/sessions-table';
import StatsOverview from './components/stats-overview';
import { ErrorDisplay, LoadingOverlay } from './components/status-displays';
import { useExportData } from './hooks/use-export-data';
import type {
  TimeTrackingStats,
  GroupedSession,
} from '@/lib/time-tracking-helper';

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function TimeTrackerManagementClient({
  wsId,
  groupedSessions,
  pagination,
  stats,
  currentPeriod,
  currentStartDate,
  currentEndDate,
}: {
  wsId: string;
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

  // Use export hook
  const {
    exportState,
    error: exportError,
    setError: setExportError,
    handleExportCSV,
    handleExportExcel,
  } = useExportData({
    wsId,
    period,
    searchQuery,
    startDate,
    endDate,
  });

  // Combine errors
  useEffect(() => {
    if (exportError) {
      setError(exportError);
      setExportError(null);
    }
  }, [exportError, setExportError]);

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
    total_sessions: groupedSessions.length,
    active_sessions: groupedSessions.filter((s) => s.status === 'active')
      .length,
    active_users: Array.from(
      new Set(groupedSessions.map((s) => s.user.displayName))
    ).length,
    today_time: 0,
    week_time: 0,
    month_time: 0,
    today_sessions: 0,
    week_sessions: 0,
    month_sessions: 0,
    current_streak: 0,
  };

  const hasActiveFilters = searchQuery || startDate || endDate;
  const clearAllFilters = () => {
    handleSearchChange('');
    handleClearDateFilters();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <ManagementHeader />

      {/* Error Display */}
      {error && <ErrorDisplay error={error} />}

      {/* Loading Overlay */}
      {isLoading && <LoadingOverlay />}

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
            isLoading={isLoading || exportState.isExporting}
            hasActiveFilters={!!hasActiveFilters}
            onClearFilters={clearAllFilters}
            onExportCSV={handleExportCSV}
            onExportExcel={handleExportExcel}
          />
        </Suspense>
      </div>

      {/* Export Progress Dialog */}
      <ExportProgressDialog
        isExporting={exportState.isExporting}
        exportProgress={exportState.exportProgress}
        exportStatus={exportState.exportStatus}
        estimatedTimeRemaining={exportState.estimatedTimeRemaining}
        exportType={exportState.exportType}
      />

      {/* Session Details Modal */}
      <SessionDetailsModal
        isOpen={isModalOpen}
        onClose={setIsModalOpen}
        session={selectedSession}
        period={period}
      />
    </div>
  );
}
