'use client';

import { AlertCircle, Clock, Loader2 } from '@tuturuuu/icons';
import type { TimeTrackingSession } from '@tuturuuu/types/db';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Progress } from '@tuturuuu/ui/progress';
import { XLSX } from '@tuturuuu/ui/xlsx';
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

  // Export progress states
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('');
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] =
    useState<number>(0);
  const [exportType, setExportType] = useState<'csv' | 'excel' | ''>('');

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

  // Helper function to format time remaining
  const formatTimeRemaining = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = Math.round(seconds % 60);
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  };

  // Fetch all data for export with progress tracking
  const fetchAllDataForExport = async (): Promise<GroupedSession[]> => {
    const startTime = Date.now();
    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('Preparing export...');
    setEstimatedTimeRemaining(0);

    try {
      // First, get the total count with a small batch size for accurate pagination
      setExportStatus('Calculating total records...');
      const initialParams = new URLSearchParams();
      initialParams.set('wsId', wsId);
      initialParams.set('period', period);
      initialParams.set('page', '1');
      initialParams.set('limit', '10'); // Small batch to get accurate total count
      if (searchQuery) initialParams.set('search', searchQuery);
      if (startDate) initialParams.set('startDate', startDate);
      if (endDate) initialParams.set('endDate', endDate);

      const initialResponse = await fetch(
        `/api/time-tracking/export?${initialParams}`
      );

      if (!initialResponse.ok) {
        throw new Error('Failed to fetch data for export');
      }

      const initialData = await initialResponse.json();
      const totalRecords = initialData.pagination?.total || 0;

      if (totalRecords === 0) {
        setExportStatus('No data to export');
        setIsExporting(false);
        return [];
      }

      setExportStatus(`Found ${totalRecords} records. Fetching data...`);

      const allSessions: GroupedSession[] = [];
      const batchSize = 100; // Optimal batch size for export
      const totalPages = Math.ceil(totalRecords / batchSize);

      let processedRecords = 0;

      for (let page = 1; page <= totalPages; page++) {
        const currentTime = Date.now();
        const elapsedTime = (currentTime - startTime) / 1000; // in seconds

        // Calculate progress and time estimation
        const progressPercent = ((page - 1) / totalPages) * 80; // Use 80% for fetching
        setExportProgress(progressPercent);

        // Estimate time remaining based on current progress
        if (page > 1) {
          const recordsPerSecond = processedRecords / elapsedTime;
          const remainingRecords = totalRecords - processedRecords;
          const estimatedSeconds = remainingRecords / recordsPerSecond;
          setEstimatedTimeRemaining(estimatedSeconds);
        }

        setExportStatus(
          `Fetching batch ${page} of ${totalPages} (${processedRecords}/${totalRecords} records)...`
        );

        const params = new URLSearchParams();
        params.set('wsId', wsId);
        params.set('period', period);
        params.set('page', page.toString());
        params.set('limit', batchSize.toString());
        if (searchQuery) params.set('search', searchQuery);
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);

        const response = await fetch(`/api/time-tracking/export?${params}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch page ${page}`);
        }

        const data = await response.json();
        const batchData = data.data || [];
        allSessions.push(...batchData);
        processedRecords += batchData.length;

        // Small delay to prevent overwhelming the server
        if (page < totalPages) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      setExportProgress(90);
      setExportStatus('Processing data for export...');
      setEstimatedTimeRemaining(2); // Final processing should be quick

      return allSessions;
    } catch (error) {
      console.error('Error fetching all data for export:', error);
      setError('Failed to fetch all data for export. Please try again.');
      setIsExporting(false);
      setExportProgress(0);
      setExportStatus('');
      setEstimatedTimeRemaining(0);
      return [];
    }
  };

  // Export functionality
  const formatDurationForExport = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Create proper XLSX file using SheetJS
  const createXlsxFile = (data: any[]): ArrayBuffer => {
    const headers = [
      'User',
      'Period',
      'Period Type',
      'Session Count',
      'Total Duration',
      'Total Duration (Seconds)',
      'Average Duration',
      'Status',
      'First Start Time',
      'Last End Time',
      'Session Titles',
    ];

    // Prepare worksheet data
    const worksheetData = [
      headers,
      ...data.map((row) => [
        row.user,
        row.period,
        row.periodType,
        row.sessionCount,
        row.totalDuration,
        row.totalDurationSeconds,
        row.averageDuration,
        row.status,
        row.firstStartTime,
        row.lastEndTime,
        row.sessionTitles,
      ]),
    ];

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // Set column widths
    const columnWidths = [
      { wch: 20 }, // User
      { wch: 15 }, // Period
      { wch: 12 }, // Period Type
      { wch: 12 }, // Session Count
      { wch: 15 }, // Total Duration
      { wch: 18 }, // Total Duration (Seconds)
      { wch: 15 }, // Average Duration
      { wch: 10 }, // Status
      { wch: 20 }, // First Start Time
      { wch: 20 }, // Last End Time
      { wch: 30 }, // Session Titles
    ];
    worksheet['!cols'] = columnWidths;

    // Style the header row
    const headerStyle = {
      font: { bold: true, color: { rgb: '000000' } },
      fill: { fgColor: { rgb: 'E0E0E0' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top: { style: 'thin', color: { rgb: '000000' } },
        bottom: { style: 'thin', color: { rgb: '000000' } },
        left: { style: 'thin', color: { rgb: '000000' } },
        right: { style: 'thin', color: { rgb: '000000' } },
      },
    };

    // Apply header styling
    for (let i = 0; i < headers.length; i++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: i });
      if (!worksheet[cellAddress]) continue;
      worksheet[cellAddress].s = headerStyle;
    }

    // Create workbook and add worksheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Time Tracking Sessions');

    // Generate XLSX binary
    return XLSX.write(workbook, {
      type: 'array',
      bookType: 'xlsx',
      compression: true,
    });
  };

  const prepareExportData = (sessions: GroupedSession[]) => {
    const flattenedData: Array<{
      user: string;
      period: string;
      periodType: string;
      sessionCount: number;
      totalDuration: string;
      totalDurationSeconds: number;
      averageDuration: string;
      status: string;
      firstStartTime: string;
      lastEndTime: string;
      sessionTitles: string;
    }> = [];

    sessions.forEach((session) => {
      const sessionTitles = Array.from(
        new Set(session.sessions.map((s) => s.title).filter(Boolean))
      ).join('; ');

      flattenedData.push({
        user: session.user.displayName || 'Unknown User',
        period: session.period,
        periodType:
          period === 'day' ? 'Daily' : period === 'week' ? 'Weekly' : 'Monthly',
        sessionCount: session.sessions.length,
        totalDuration: formatDurationForExport(session.totalDuration),
        totalDurationSeconds: session.totalDuration,
        averageDuration: formatDurationForExport(
          Math.round(session.totalDuration / session.sessions.length)
        ),
        status: session.status,
        firstStartTime: dayjs(session.firstStartTime).format(
          'YYYY-MM-DD HH:mm:ss'
        ),
        lastEndTime: session.lastEndTime
          ? dayjs(session.lastEndTime).format('YYYY-MM-DD HH:mm:ss')
          : 'N/A',
        sessionTitles: sessionTitles || 'No titles',
      });
    });

    return flattenedData;
  };

  const downloadFile = (
    content: string | ArrayBuffer,
    fileName: string,
    contentType: string
  ) => {
    try {
      const blob = new Blob([content], { type: contentType });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      setError('Export failed. Please try again.');
    }
  };

  const escapeCsvValue = (value: string | number): string => {
    if (typeof value === 'number') return value.toString();
    const stringValue = value.toString();
    if (
      stringValue.includes(',') ||
      stringValue.includes('"') ||
      stringValue.includes('\n')
    ) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  };

  const handleExportCSV = async () => {
    try {
      setExportType('csv');
      const allSessions = await fetchAllDataForExport();
      if (allSessions.length === 0) {
        return;
      }

      setExportStatus('Preparing CSV file...');
      setExportProgress(95);
      setEstimatedTimeRemaining(3);

      const data = prepareExportData(allSessions);
      const headers = [
        'User',
        'Period',
        'Period Type',
        'Session Count',
        'Total Duration',
        'Total Duration (Seconds)',
        'Average Duration',
        'Status',
        'First Start Time',
        'Last End Time',
        'Session Titles',
      ];

      const csvContent = [
        headers.join(','),
        ...data.map((row) =>
          [
            escapeCsvValue(row.user),
            escapeCsvValue(row.period),
            escapeCsvValue(row.periodType),
            escapeCsvValue(row.sessionCount),
            escapeCsvValue(row.totalDuration),
            escapeCsvValue(row.totalDurationSeconds),
            escapeCsvValue(row.averageDuration),
            escapeCsvValue(row.status),
            escapeCsvValue(row.firstStartTime),
            escapeCsvValue(row.lastEndTime),
            escapeCsvValue(row.sessionTitles),
          ].join(',')
        ),
      ].join('\n');

      setExportStatus('Downloading CSV file...');
      setExportProgress(100);
      setEstimatedTimeRemaining(1);

      const fileName = `time-tracking-sessions-${dayjs().format('YYYY-MM-DD-HH-mm-ss')}.csv`;
      downloadFile(csvContent, fileName, 'text/csv;charset=utf-8;');

      // Reset export states after a delay
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
        setExportStatus('');
        setEstimatedTimeRemaining(0);
        setExportType('');
      }, 1000);
    } catch (error) {
      console.error('CSV export failed:', error);
      setError('CSV export failed. Please try again.');
      resetExportState();
    }
  };

  const resetExportState = () => {
    setIsExporting(false);
    setExportProgress(0);
    setExportStatus('');
    setEstimatedTimeRemaining(0);
    setExportType('');
  };

  const handleExportExcel = async () => {
    try {
      setExportType('excel');
      const allSessions = await fetchAllDataForExport();
      if (allSessions.length === 0) {
        return;
      }

      setExportStatus('Preparing Excel file...');
      setExportProgress(95);
      setEstimatedTimeRemaining(5);

      const data = prepareExportData(allSessions);

      // Create proper XLSX format using our custom function
      const xlsxContent = createXlsxFile(data);

      setExportStatus('Downloading Excel file...');
      setExportProgress(100);
      setEstimatedTimeRemaining(1);

      const fileName = `time-tracking-sessions-${dayjs().format('YYYY-MM-DD-HH-mm-ss')}.xlsx`;
      downloadFile(
        xlsxContent,
        fileName,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      // Reset export states after a delay
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
        setExportStatus('');
        setEstimatedTimeRemaining(0);
        setExportType('');
      }, 1000);
    } catch (error) {
      console.error('Excel export failed:', error);
      setError('Excel export failed. Please try again.');
      resetExportState();
    }
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
              <div className="rounded-lg bg-linear-to-br from-dynamic-blue/20 to-dynamic-purple/20 p-3 ring-2 ring-dynamic-blue/10">
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
            isLoading={isLoading || isExporting}
            hasActiveFilters={!!hasActiveFilters}
            onClearFilters={clearAllFilters}
            onExportCSV={handleExportCSV}
            onExportExcel={handleExportExcel}
          />
        </Suspense>
      </div>

      {/* Export Progress Dialog */}
      <Dialog open={isExporting} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" showCloseButton={false}>
          <div className="space-y-6 p-2">
            {/* Header */}
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-full bg-linear-to-br from-dynamic-green/20 to-dynamic-blue/20 ring-2 ring-dynamic-green/10">
                <Loader2 className="size-6 animate-spin text-dynamic-green" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-dynamic-foreground text-lg">
                  Exporting {exportType === 'csv' ? 'CSV' : 'Excel'} File
                </h3>
                <p className="text-dynamic-muted text-sm">
                  Please don't close this window while exporting
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-dynamic-foreground">Progress</span>
                <span className="font-medium font-mono text-dynamic-green">
                  {Math.round(exportProgress)}%
                </span>
              </div>

              <Progress
                value={exportProgress}
                className="h-3 bg-dynamic-muted/20"
              />

              <div className="flex items-center justify-between text-xs">
                <span className="text-dynamic-muted">{exportStatus}</span>
                {estimatedTimeRemaining > 0 && (
                  <span className="text-dynamic-muted">
                    ~{formatTimeRemaining(estimatedTimeRemaining)} remaining
                  </span>
                )}
              </div>
            </div>

            {/* Tips */}
            <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex size-5 items-center justify-center rounded-full bg-dynamic-blue/20">
                  <span className="text-dynamic-blue text-xs">💡</span>
                </div>
                <div className="flex-1 text-xs">
                  <p className="font-medium text-dynamic-blue">Export Tips</p>
                  <p className="mt-1 text-dynamic-blue/80">
                    Large exports may take a few minutes. The file will download
                    automatically when complete.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
