import { Effect } from '@tuturuuu/utils/effect';
import { NextRequest, NextResponse } from 'next/server';
import { POST as syncWorkspaceCalendar } from '@/app/api/v1/workspaces/[wsId]/calendar/sync/route';
import {
  reportCalendarDeactivationSpike,
  summarizeCalendarTokenOutcomes,
  systemicProviders,
  withCalendarTokenHealthRun,
} from '@/lib/calendar/oauth-token-health';
import { CONSENSUS_ACCOUNTS } from '@/lib/calendar/oauth-token-quarantine';
import {
  CRON_BUDGET_MS,
  checkProviderSyncBudget,
  createSyncAdminClient,
  MAX_SYNC_WORKSPACES,
  providerSyncSignal,
  rotatingSyncBatch,
  withProviderSyncBudget,
} from '@/lib/calendar/provider-sync-budget';
import { withCronLogDrain } from '@/lib/infrastructure/log-drain';

export const maxDuration = 300;
const ROUTE = '/api/cron/calendar/provider-sync';

class WorkspaceSyncHttpError extends Error {
  constructor(public readonly status: number) {
    super('Workspace sync HTTP failure');
    this.name = 'WorkspaceSyncHttpError';
  }
}

function failureDiagnostic(error: unknown) {
  return {
    errorName: error instanceof Error ? error.name : 'unknown',
    ...(error instanceof WorkspaceSyncHttpError
      ? { httpStatus: error.status }
      : {}),
  };
}

export async function GET(request: NextRequest) {
  return withCronLogDrain(
    {
      jobId: 'calendar-provider-sync',
      path: ROUTE,
      request: request,
    },
    () => handleGET(request)
  );
}

async function handleGET(request: NextRequest) {
  const cronSecret =
    process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';

  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET or VERCEL_CRON_SECRET is not set' },
      { status: 500 }
    );
  }

  if (request.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const { result: dispatch, outcomes } = await withCalendarTokenHealthRun(
      ROUTE,
      () => dispatchWorkspaces(request, cronSecret)
    );
    if (dispatch instanceof NextResponse) return dispatch;
    reportCalendarDeactivationSpike(ROUTE, outcomes);
    const tokenCounts = summarizeCalendarTokenOutcomes(outcomes);
    // Fail the job only when a provider's OAuth client looks broken for
    // everyone. Account-level failures, including breaker holds amid healthy
    // refreshes, return 200 so the scheduler's failure budget is not spent.
    const broken = systemicProviders(outcomes, CONSENSUS_ACCOUNTS);
    return NextResponse.json(
      {
        ...dispatch,
        ok: dispatch.ok && broken.length === 0,
        ...(broken.length
          ? { error: 'Calendar OAuth client failure', providers: broken }
          : {}),
        tokens: { counts: tokenCounts, outcomes },
      },
      { status: broken.length ? 500 : 200 }
    );
  } catch (error) {
    console.error(
      'Calendar provider sync dispatch failed',
      failureDiagnostic(error)
    );
    return NextResponse.json(
      {
        ok: false,
        error: 'Calendar provider sync dispatch failed',
      },
      { status: 500 }
    );
  }
}

function dispatchWorkspaces(request: NextRequest, cronSecret: string) {
  return withProviderSyncBudget(
    AbortSignal.any([request.signal, AbortSignal.timeout(CRON_BUDGET_MS)]),
    async () => {
      const sbAdmin = await createSyncAdminClient();
      // Supabase caps unpaginated reads; walk stable pages before dispatching.
      const workspaceSet = new Set<string>();
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        checkProviderSyncBudget();
        if (offset > 10_000)
          throw new Error('Calendar workspace scan limit exceeded');
        const { data: tokenRows, error } = await sbAdmin
          .from('calendar_auth_tokens')
          .select('ws_id, calendar_connections!inner(id)')
          .eq('is_active', true)
          .eq('calendar_connections.is_enabled', true)
          .eq('calendar_connections.sync_inbound_enabled', true)
          .order('id', { ascending: true })
          .range(offset, offset === 10_000 ? offset : offset + pageSize - 1);
        if (error) {
          return NextResponse.json(
            { ok: false, error: 'Failed to fetch connected workspaces' },
            { status: 500 }
          );
        }
        if (offset === 10_000 && (tokenRows?.length ?? 0) > 0)
          throw new Error('Calendar workspace scan limit exceeded');
        for (const row of tokenRows ?? []) workspaceSet.add(row.ws_id);
        if (!tokenRows || tokenRows.length < pageSize) break;
      }
      const workspaceIds = rotatingSyncBatch(
        [...workspaceSet],
        MAX_SYNC_WORKSPACES
      );

      const results: Array<{
        ws_id: string;
        success: boolean;
        summary?: unknown;
        error?: string;
      }> = [];

      let notStarted = 0;
      await Effect.runPromise(
        Effect.forEach(
          workspaceIds,
          (wsId) =>
            Effect.tryPromise(async () => {
              try {
                if (providerSyncSignal()?.aborted) {
                  notStarted += 1;
                  return;
                }
                checkProviderSyncBudget();
                const response = await syncWorkspaceCalendar(
                  new NextRequest(
                    new URL(
                      `/api/v1/workspaces/${wsId}/calendar/sync`,
                      request.url
                    ),
                    {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${cronSecret}`,
                      },
                      body: JSON.stringify({
                        direction: 'inbound',
                        source: 'cron',
                      }),
                    }
                  ),
                  { params: Promise.resolve({ wsId }) }
                );

                if (!response.ok) {
                  await response.body?.cancel();
                  throw new WorkspaceSyncHttpError(response.status);
                }

                const body = await response.json().catch(() => null);

                results.push({
                  ws_id: wsId,
                  success: body?.ok !== false,
                  summary: body?.summary ?? null,
                  ...(body?.ok === false
                    ? { error: body.code || 'Calendar sync partially failed' }
                    : {}),
                });
              } catch (syncError) {
                console.warn('Calendar provider sync workspace failed', {
                  wsId,
                  ...failureDiagnostic(syncError),
                });
                results.push({
                  ws_id: wsId,
                  success: false,
                  error:
                    syncError instanceof Error &&
                    syncError.name === 'TimeoutError'
                      ? 'Calendar sync deadline exceeded'
                      : 'Workspace sync failed',
                });
              }
            }),
          { concurrency: 3 }
        )
      );

      return {
        ok: results.every((result) => result.success),
        processed: results.length,
        deferred: workspaceSet.size - workspaceIds.length + notStarted,
        successful: results.filter((result) => result.success).length,
        failed: results.filter((result) => !result.success).length,
        results,
      };
    }
  );
}
