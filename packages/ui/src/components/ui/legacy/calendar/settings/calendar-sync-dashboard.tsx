'use client';

import type { SyncLog } from './types';
import { useQuery } from '@tanstack/react-query';
import type { Workspace } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { AnalyticsCharts } from '@tuturuuu/ui/legacy/calendar/settings/analytics-charts';
import { SummaryCards } from '@tuturuuu/ui/legacy/calendar/settings/summary-cards';
import { SyncLogsTable } from '@tuturuuu/ui/legacy/calendar/settings/sync-logs-table';
import { Calendar, Download, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';

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

  // Fallback to mock workspaces if API fails
  const workspaces: Workspace[] = workspacesQuery.data || [
    { id: 'ws_1', name: 'Marketing Team' },
    { id: 'ws_2', name: 'Engineering' },
    { id: 'ws_3', name: 'Sales Department' },
    { id: 'ws_4', name: 'Executive Team' },
  ];

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
        log.workspace?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.calendarSource.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesType && matchesWorkspace && matchesSearch;
    });
  }, [filterType, filterWorkspace, searchTerm, syncLogs]);

  const totalEvents = useMemo(() => {
    return syncLogs.reduce(
      (acc, log) => ({
        added: acc.added + log.events.added,
        updated: acc.updated + log.events.updated,
        deleted: acc.deleted + log.events.deleted,
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
    return ((completedSyncs / syncLogs.length) * 100).toFixed(1);
  }, [completedSyncs, syncLogs.length]);

  // Generate mock time series data for charts
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

    for (let i = 23; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60 * 60 * 1000);
      const hour = time.getHours();

      // Simulate realistic sync patterns (more activity during business hours)
      const baseActivity = hour >= 9 && hour <= 17 ? 3 : 1;
      const variance = Math.random() * 2;

      data.push({
        time: time.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        syncs: Math.floor(baseActivity + variance),
        success: Math.floor((baseActivity + variance) * 0.85),
        failed: Math.floor((baseActivity + variance) * 0.15),
        events: Math.floor((baseActivity + variance) * 12),
        duration: 1500 + Math.random() * 1000,
      });
    }

    return data;
  };

  const timeSeriesData = generateTimeSeriesData();

  // Workspace activity data
  const workspaceActivityData = workspaces.map((workspace) => {
    const workspaceLogs = syncLogs.filter(
      (log) => log.workspace?.id === workspace.id
    );
    const totalEvents = workspaceLogs.reduce(
      (sum, log) =>
        sum + log.events.added + log.events.updated + log.events.deleted,
      0
    );

    return {
      name: workspace.name,
      syncs: workspaceLogs.length,
      events: totalEvents,
      success: workspaceLogs.filter((log) => log.status === 'completed').length,
      color: 'bg-blue-500',
    };
  });

  // Calendar source distribution
  const calendarSourceData = [
    { name: 'Google Calendar', value: 45, color: '#4285f4' },
    { name: 'Outlook Calendar', value: 35, color: '#0078d4' },
    { name: 'Apple Calendar', value: 20, color: '#007aff' },
  ];

  // Event type distribution over time
  const eventTypeData = [
    { period: '00:00', added: 12, updated: 8, deleted: 3 },
    { period: '04:00', added: 5, updated: 3, deleted: 1 },
    { period: '08:00', added: 25, updated: 15, deleted: 4 },
    { period: '12:00', added: 35, updated: 22, deleted: 6 },
    { period: '16:00', added: 28, updated: 18, deleted: 5 },
    { period: '20:00', added: 15, updated: 10, deleted: 2 },
  ];

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
              <h1 className="font-semibold text-xl">Calendar Sync Dashboard</h1>
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
