'use client';

import type { SyncLog } from './types';
import { useQuery } from '@tanstack/react-query';
import type { Workspace as DbWorkspace } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { AnalyticsCharts } from '@tuturuuu/ui/legacy/calendar/settings/analytics-charts';
import { SummaryCards } from '@tuturuuu/ui/legacy/calendar/settings/summary-cards';
import { SyncLogsTable } from '@tuturuuu/ui/legacy/calendar/settings/sync-logs-table';
import { Calendar, Download, RefreshCw } from 'lucide-react';
import { useMemo, useState, useCallback } from 'react';

const getWorkspaces = async () => {
  const workspaces = await fetch('/api/workspaces');
  if (!workspaces.ok) {
    throw new Error(`Failed to fetch workspaces: ${workspaces.status}`);
  }
  return workspaces.json();
};

export function CalendarSyncDashboard({ syncLogs }: { syncLogs: SyncLog[] }) {
  const [filterType, setFilterType] = useState('all');
  const [filterWorkspace, setFilterWorkspace] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Get workspaces from API
  const workspacesQuery = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => getWorkspaces(),
    refetchInterval: 1000 * 60 * 5, // 5 minutes
  });

  // Use database workspaces directly
  const workspaces: DbWorkspace[] = useMemo(() => {
    return workspacesQuery.data || [];
  }, [workspacesQuery.data]);

  const filteredLogs = useMemo(() => {
    return syncLogs.filter((log) => {
      const matchesType = filterType === 'all' || log.type === filterType;
      const matchesWorkspace =
        filterWorkspace === 'all' || log.workspace?.id === filterWorkspace;
      const matchesSearch =
        searchTerm === '' ||
        log.triggeredBy?.display_name
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        log.triggeredBy?.handle
          ?.toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        log.workspace?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.calendarSource.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesType && matchesWorkspace && matchesSearch;
    });
  }, [filterType, filterWorkspace, searchTerm, syncLogs]);

  const totalEvents = useMemo(() => {
    return syncLogs.reduce(
      (acc, log) => ({
        added: acc.added + (log.events?.added || 0),
        updated: acc.updated + (log.events?.updated || 0),
        deleted: acc.deleted + (log.events?.deleted || 0),
      }),
      { added: 0, updated: 0, deleted: 0 }
    );
  }, [syncLogs]);

  const completedSyncs = useMemo(() => {
    return syncLogs.filter((log) => log.status === 'completed').length;
  }, [syncLogs]);

  const failedSyncs = useMemo(() => {
    return syncLogs.filter((log) => log.status === 'failed').length;
  }, [syncLogs]);

  const successRate = useMemo(() => {
    if (syncLogs.length === 0) return '0.0';
    return ((completedSyncs / syncLogs.length) * 100).toFixed(1);
  }, [completedSyncs, syncLogs.length]);

  // Helper function to get color for calendar sources
  const getSourceColor = useCallback((source: string) => {
    const colors: Record<string, string> = {
      'Google Calendar': '#4285f4',
      'Outlook Calendar': '#0078d4',
      'Apple Calendar': '#007aff',
      'Unknown': '#6b7280',
    };
    return colors[source] || '#6b7280';
  }, []);

  // Generate time series data for charts based on actual sync logs
  const generateTimeSeriesData = () => {
    const data: {
      time: string;
      syncs: number;
      success: number;
      failed: number;
      events: number;
      duration: number;
    }[] = [];
    const now = new Date();

    // Group sync logs by hour for the last 24 hours
    for (let i = 23; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hourStart = new Date(time.getTime());
      const hourEnd = new Date(time.getTime() + 60 * 60 * 1000);

      const hourLogs = syncLogs.filter((log) => {
        const logTime = new Date(log.timestamp);
        return logTime >= hourStart && logTime < hourEnd;
      });

      const successCount = hourLogs.filter((log) => log.status === 'completed').length;
      const failedCount = hourLogs.filter((log) => log.status === 'failed').length;
      const totalEvents = hourLogs.reduce((sum, log) => 
        sum + (log.events?.added || 0) + (log.events?.updated || 0) + (log.events?.deleted || 0), 0
      );
      const avgDuration = hourLogs.length > 0 
        ? hourLogs.reduce((sum, log) => sum + (log.duration || 0), 0) / hourLogs.length 
        : 0;

      data.push({
        time: time.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        syncs: hourLogs.length,
        success: successCount,
        failed: failedCount,
        events: totalEvents,
        duration: avgDuration,
      });
    }

    return data;
  };

  const timeSeriesData = generateTimeSeriesData();

  // Workspace activity data based on actual data
  const workspaceActivityData = workspaces.map((workspace) => {
    const workspaceLogs = syncLogs.filter(
      (log) => log.workspace?.id === workspace.id
    );
    const totalEvents = workspaceLogs.reduce(
      (sum, log) =>
        sum + (log.events?.added || 0) + (log.events?.updated || 0) + (log.events?.deleted || 0),
      0
    );

    return {
      name: workspace.name || 'Unknown Workspace',
      syncs: workspaceLogs.length,
      events: totalEvents,
      success: workspaceLogs.filter((log) => log.status === 'completed').length,
      color: 'bg-blue-500', // Default color for all workspaces
    };
  });

  // Calendar source distribution based on actual data
  const calendarSourceData = useMemo(() => {
    const sourceCounts: Record<string, number> = {};
    
    syncLogs.forEach((log) => {
      const source = log.calendarSource || 'Unknown';
      if (source) {
        sourceCounts[source] = (sourceCounts[source] || 0) + 1;
      }
    });

    const total = syncLogs.length;
    return Object.entries(sourceCounts).map(([name, count]) => ({
      name: name || 'Unknown',
      value: total > 0 ? Math.round((count / total) * 100) : 0,
      color: getSourceColor(name || 'Unknown'),
    }));
  }, [syncLogs, getSourceColor]);

  // Event type distribution over time based on actual data
  const eventTypeData = useMemo(() => {
    const periods = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];
    return periods.map((period) => {
             const periodLogs = syncLogs.filter((log) => {
         const logTime = new Date(log.timestamp);
         const hour = logTime.getHours();
         const periodParts = period.split(':');
         const periodHour = periodParts[0] ? parseInt(periodParts[0]) : 0;
         return hour >= periodHour && hour < periodHour + 4;
       });

      return {
        period,
        added: periodLogs.reduce((sum, log) => sum + (log.events?.added || 0), 0),
        updated: periodLogs.reduce((sum, log) => sum + (log.events?.updated || 0), 0),
        deleted: periodLogs.reduce((sum, log) => sum + (log.events?.deleted || 0), 0),
      };
    });
  }, [syncLogs]);

  return (
    <div className="flex min-h-screen flex-col gap-4">
      {/* Header */}
      <header className="sticky top-0 z-10 rounded-lg border-b bg-foreground/10 backdrop-blur-sm">
        <div className="flex h-16 items-center px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-dynamic-blue to-dynamic-blue/80">
              <Calendar className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Calendar Sync Dashboard</h1>
              <p className="text-sm opacity-70">
                Monitor workspace calendar synchronization
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline">
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button size="sm">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <main>
        <div className="mx-auto space-y-8">
          {/* Summary Cards */}
          <SummaryCards
            totalSyncs={syncLogs.length}
            successRate={successRate}
            failedSyncs={failedSyncs}
            totalEvents={totalEvents}
          />

          {/* Analytics Charts */}
          <AnalyticsCharts
            timeSeriesData={timeSeriesData}
            eventTypeData={eventTypeData}
            workspaceActivityData={workspaceActivityData}
            calendarSourceData={calendarSourceData}
          />

          {/* Sync Logs Table */}
          <SyncLogsTable
            syncLogs={filteredLogs}
            workspaces={workspaces}
            filterType={filterType}
            filterWorkspace={filterWorkspace}
            searchTerm={searchTerm}
            onFilterTypeChange={setFilterType}
            onFilterWorkspaceChange={setFilterWorkspace}
            onSearchTermChange={setSearchTerm}
          />
        </div>
      </main>
    </div>
  );
}
