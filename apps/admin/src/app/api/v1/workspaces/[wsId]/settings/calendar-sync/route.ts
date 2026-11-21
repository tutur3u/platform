import { resolveSatelliteRequestActor } from '@tuturuuu/satellite/workspace-access';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
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

export async function GET(request: Request, { params }: Params) {
  const actor = await resolveSatelliteRequestActor(request, 'infra');
  if (!actor)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { wsId } = await params;
  const member = await verifyWorkspaceMembershipType({
    wsId,
    userId: actor.user.id,
    supabase: actor.admin,
  });
  if (!member.ok)
    return NextResponse.json(
      { error: 'Workspace access denied' },
      { status: member.error === 'membership_lookup_failed' ? 500 : 403 }
    );
  const [metrics, logsResult] = await Promise.all([
    getSyncMetrics(wsId, actor),
    getSyncLogs(wsId, { limit: 25, offset: 0 }, actor),
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
