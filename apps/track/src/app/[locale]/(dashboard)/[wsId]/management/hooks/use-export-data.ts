'use client';

import type { TimeTrackingSession } from '@tuturuuu/types';
import { XLSX } from '@tuturuuu/ui/xlsx';
import dayjs from 'dayjs';
import { useCallback, useState } from 'react';

interface GroupedSession {
  title: string;
  category: {
    name: string;
    color: string;
  } | null;
  sessions: TimeTrackingSession[];
  /** Total duration across all sessions (sum of duration_seconds) */
  totalDuration: number;
  /** Duration that falls within the specific period (properly split for overnight sessions) */
  periodDuration?: number;
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

interface ExportState {
  isExporting: boolean;
  exportProgress: number;
  exportStatus: string;
  estimatedTimeRemaining: number;
  exportType: 'csv' | 'excel' | '';
}

interface ExportParams {
  wsId: string;
  period: 'day' | 'week' | 'month';
  searchQuery: string;
  startDate: string;
  endDate: string;
}

interface ExportDataRow {
  user: string;
  period: string;
  periodType: string;
  sessionCount: number;
  /** Period-specific duration (properly split for overnight sessions) */
  periodDuration: string;
  periodDurationSeconds: number;
  /** Total duration across all sessions (for reference) */
  totalDuration: string;
  totalDurationSeconds: number;
  averageDuration: string;
  status: string;
  firstStartTime: string;
  lastEndTime: string;
  sessionTitles: string;
}

export function useExportData(params: ExportParams) {
  const { wsId, period, searchQuery, startDate, endDate } = params;

  const [exportState, setExportState] = useState<ExportState>({
    isExporting: false,
    exportProgress: 0,
    exportStatus: '',
    estimatedTimeRemaining: 0,
    exportType: '',
  });
  const [error, setError] = useState<string | null>(null);

  const resetExportState = useCallback(() => {
    setExportState({
      isExporting: false,
      exportProgress: 0,
      exportStatus: '',
      estimatedTimeRemaining: 0,
      exportType: '',
    });
  }, []);

  // Format duration for export
  const formatDurationForExport = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Escape CSV values
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

  // Download file helper
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
    } catch (err) {
      console.error('Export failed:', err);
      setError('Export failed. Please try again.');
    }
  };

  // Create XLSX file
  const createXlsxFile = (data: ExportDataRow[]): ArrayBuffer => {
    const headers = [
      'User',
      'Period',
      'Period Type',
      'Session Count',
      'Period Duration',
      'Period Duration (Seconds)',
      'Total Duration',
      'Total Duration (Seconds)',
      'Average Duration',
      'Status',
      'First Start Time',
      'Last End Time',
      'Session Titles',
    ];

    const worksheetData = [
      headers,
      ...data.map((row) => [
        row.user,
        row.period,
        row.periodType,
        row.sessionCount,
        row.periodDuration,
        row.periodDurationSeconds,
        row.totalDuration,
        row.totalDurationSeconds,
        row.averageDuration,
        row.status,
        row.firstStartTime,
        row.lastEndTime,
        row.sessionTitles,
      ]),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    worksheet['!cols'] = [
      { wch: 20 },
      { wch: 15 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 20 },
      { wch: 15 },
      { wch: 18 },
      { wch: 15 },
      { wch: 10 },
      { wch: 20 },
      { wch: 20 },
      { wch: 30 },
    ];

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

    for (let i = 0; i < headers.length; i++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: i });
      if (!worksheet[cellAddress]) continue;
      worksheet[cellAddress].s = headerStyle;
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Time Tracking Sessions');

    return XLSX.write(workbook, {
      type: 'array',
      bookType: 'xlsx',
      compression: true,
    });
  };

  // Prepare export data
  const prepareExportData = (sessions: GroupedSession[]): ExportDataRow[] => {
    return sessions.map((session) => {
      const sessionTitles = Array.from(
        new Set(session.sessions.map((s) => s.title).filter(Boolean))
      ).join('; ');

      // Use periodDuration if available (properly split for overnight sessions), fallback to totalDuration
      const effectiveDuration = session.periodDuration ?? session.totalDuration;

      return {
        user: session.user.displayName || 'Unknown User',
        period: session.period,
        periodType:
          period === 'day' ? 'Daily' : period === 'week' ? 'Weekly' : 'Monthly',
        sessionCount: session.sessions.length,
        periodDuration: formatDurationForExport(effectiveDuration),
        periodDurationSeconds: effectiveDuration,
        totalDuration: formatDurationForExport(session.totalDuration),
        totalDurationSeconds: session.totalDuration,
        averageDuration: formatDurationForExport(
          Math.round(effectiveDuration / session.sessions.length)
        ),
        status: session.status,
        firstStartTime: dayjs(session.firstStartTime).format(
          'YYYY-MM-DD HH:mm:ss'
        ),
        lastEndTime: session.lastEndTime
          ? dayjs(session.lastEndTime).format('YYYY-MM-DD HH:mm:ss')
          : 'N/A',
        sessionTitles: sessionTitles || 'No titles',
      };
    });
  };

  // Fetch all data for export
  const fetchAllDataForExport = async (): Promise<GroupedSession[]> => {
    const startTime = Date.now();
    setExportState((prev) => ({
      ...prev,
      isExporting: true,
      exportProgress: 0,
      exportStatus: 'Preparing export...',
      estimatedTimeRemaining: 0,
    }));

    try {
      // Get total count
      setExportState((prev) => ({
        ...prev,
        exportStatus: 'Calculating total records...',
      }));

      const initialParams = new URLSearchParams();
      initialParams.set('wsId', wsId);
      initialParams.set('period', period);
      initialParams.set('page', '1');
      initialParams.set('limit', '10');
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
        setExportState((prev) => ({
          ...prev,
          exportStatus: 'No data to export',
          isExporting: false,
        }));
        return [];
      }

      setExportState((prev) => ({
        ...prev,
        exportStatus: `Found ${totalRecords} records. Fetching data...`,
      }));

      const allSessions: GroupedSession[] = [];
      const batchSize = 100;
      const totalPages = Math.ceil(totalRecords / batchSize);

      let processedRecords = 0;

      for (let page = 1; page <= totalPages; page++) {
        const currentTime = Date.now();
        const elapsedTime = (currentTime - startTime) / 1000;

        const progressPercent = ((page - 1) / totalPages) * 80;

        let estimatedSeconds = 0;
        if (page > 1) {
          const recordsPerSecond = processedRecords / elapsedTime;
          const remainingRecords = totalRecords - processedRecords;
          estimatedSeconds = remainingRecords / recordsPerSecond;
        }

        setExportState((prev) => ({
          ...prev,
          exportProgress: progressPercent,
          exportStatus: `Fetching batch ${page} of ${totalPages} (${processedRecords}/${totalRecords} records)...`,
          estimatedTimeRemaining: estimatedSeconds,
        }));

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

        if (page < totalPages) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      setExportState((prev) => ({
        ...prev,
        exportProgress: 90,
        exportStatus: 'Processing data for export...',
        estimatedTimeRemaining: 2,
      }));

      return allSessions;
    } catch (err) {
      console.error('Error fetching all data for export:', err);
      setError('Failed to fetch all data for export. Please try again.');
      resetExportState();
      return [];
    }
  };

  // Export CSV
  const handleExportCSV = async () => {
    try {
      setExportState((prev) => ({ ...prev, exportType: 'csv' }));
      const allSessions = await fetchAllDataForExport();
      if (allSessions.length === 0) {
        return;
      }

      setExportState((prev) => ({
        ...prev,
        exportStatus: 'Preparing CSV file...',
        exportProgress: 95,
        estimatedTimeRemaining: 3,
      }));

      const data = prepareExportData(allSessions);
      const headers = [
        'User',
        'Period',
        'Period Type',
        'Session Count',
        'Period Duration',
        'Period Duration (Seconds)',
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
            escapeCsvValue(row.periodDuration),
            escapeCsvValue(row.periodDurationSeconds),
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

      setExportState((prev) => ({
        ...prev,
        exportStatus: 'Downloading CSV file...',
        exportProgress: 100,
        estimatedTimeRemaining: 1,
      }));

      const fileName = `time-tracking-sessions-${dayjs().format('YYYY-MM-DD-HH-mm-ss')}.csv`;
      downloadFile(csvContent, fileName, 'text/csv;charset=utf-8;');

      setTimeout(resetExportState, 1000);
    } catch (err) {
      console.error('CSV export failed:', err);
      setError('CSV export failed. Please try again.');
      resetExportState();
    }
  };

  // Export Excel
  const handleExportExcel = async () => {
    try {
      setExportState((prev) => ({ ...prev, exportType: 'excel' }));
      const allSessions = await fetchAllDataForExport();
      if (allSessions.length === 0) {
        return;
      }

      setExportState((prev) => ({
        ...prev,
        exportStatus: 'Preparing Excel file...',
        exportProgress: 95,
        estimatedTimeRemaining: 5,
      }));

      const data = prepareExportData(allSessions);
      const xlsxContent = createXlsxFile(data);

      setExportState((prev) => ({
        ...prev,
        exportStatus: 'Downloading Excel file...',
        exportProgress: 100,
        estimatedTimeRemaining: 1,
      }));

      const fileName = `time-tracking-sessions-${dayjs().format('YYYY-MM-DD-HH-mm-ss')}.xlsx`;
      downloadFile(
        xlsxContent,
        fileName,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      setTimeout(resetExportState, 1000);
    } catch (err) {
      console.error('Excel export failed:', err);
      setError('Excel export failed. Please try again.');
      resetExportState();
    }
  };

  return {
    exportState,
    error,
    setError,
    handleExportCSV,
    handleExportExcel,
  };
}
