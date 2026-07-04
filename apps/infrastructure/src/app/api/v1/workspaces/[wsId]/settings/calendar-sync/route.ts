import { NextResponse } from 'next/server';
import {
  getSyncLogs,
  getSyncMetrics,
} from '@/app/[locale]/(dashboard)/[wsId]/calendar-sync/data-fetching';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { wsId } = await params;
  const [metrics, logsResult] = await Promise.all([
    getSyncMetrics(wsId),
    getSyncLogs(wsId, { limit: 25, offset: 0 }),
  ]);

  return NextResponse.json({
    logs: logsResult.logs.map((log) => ({
      duration: log.duration,
      events: log.events.added + log.events.updated + log.events.deleted,
      id: log.id,
      source: log.calendarSource,
      status: log.status,
      timestamp: log.timestamp,
      type: log.type,
      user: log.triggeredBy?.display_name ?? null,
    })),
    metrics: [
      { label: 'Total syncs (24h)', value: metrics.totalSyncs24h },
      { label: 'Success rate', value: `${metrics.successRate.toFixed(1)}%` },
      {
        label: 'Average duration',
        value: `${metrics.avgDurationMs.toFixed(0)}ms`,
      },
      { label: 'API calls (24h)', value: metrics.totalApiCalls24h },
      { label: 'Events synced (24h)', value: metrics.totalEventsSynced24h },
      { label: 'Failed syncs (24h)', value: metrics.failedSyncs24h },
    ],
    totalCount: logsResult.totalCount,
  });
}
