import { createGraphClient } from '@tuturuuu/microsoft';
import {
  convertMicrosoftEventToWorkspaceFormat,
  fetchMicrosoftEvents,
} from '@tuturuuu/microsoft/calendar';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import { performIncrementalActiveSync } from '@/lib/calendar/incremental-active-sync';
import { sanitizeWorkspaceCalendarEventFields } from '@/lib/calendar/sync-field-limits';

interface RouteParams {
  wsId: string;
}

type SyncDirection = 'inbound' | 'outbound' | 'both';
type DashboardRunRow = {
  id?: string;
  status: string | null;
  start_time: string | null;
  cooldown_remaining_seconds?: number | null;
};
type MicrosoftTokenRow = { id: string; access_token: string };
type CalendarConnectionRow = {
  calendar_id: string;
  color?: string | null;
  auth_token_id?: string | null;
};
type ExistingExternalEventRow = {
  id: string;
  external_event_id: string | null;
};

const MANUAL_COOLDOWN_MS = 30 * 1000;
const RUNNING_LOCK_MS = 5 * 60 * 1000;

function jsonError(
  error: string,
  status: number,
  extra?: Record<string, unknown>
) {
  return NextResponse.json({ error, ...extra }, { status });
}

async function verifyWorkspaceAccess(
  request: NextRequest,
  wsId: string
): Promise<{ userId: string | null; isCronAuth: boolean } | NextResponse> {
  const cronSecret =
    process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? '';
  const authHeader = request.headers.get('Authorization');
  const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (isCronAuth) {
    return { userId: null, isCronAuth: true };
  }

  const supabase = await createClient(request);
  const { user, authError } = await resolveAuthenticatedSessionUser(supabase);

  if (authError || !user) {
    return jsonError('Please sign in to sync calendars', 401);
  }

  const membership = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: user.id,
    supabase: supabase,
  });

  if (membership.error === 'membership_lookup_failed') {
    return jsonError('Failed to verify workspace access', 500);
  }

  if (!membership.ok) {
    return jsonError("You don't have access to this workspace", 403);
  }

  return { userId: user.id, isCronAuth: false };
}

async function getRecentRunState(sbAdmin: any, wsId: string) {
  const { data } = await sbAdmin
    .from('calendar_sync_dashboard')
    .select('id, status, start_time, cooldown_remaining_seconds')
    .eq('ws_id', wsId)
    .order('start_time', { ascending: false })
    .limit(5);

  const recentRuns = (data ?? []) as DashboardRunRow[];
  const nowMs = Date.now();
  const running = recentRuns.find((run) => {
    if (run.status !== 'running' || !run.start_time) return false;
    const startedAtMs = new Date(run.start_time).getTime();
    return !Number.isNaN(startedAtMs) && nowMs - startedAtMs < RUNNING_LOCK_MS;
  });
  const latest = recentRuns[0];
  const latestStartMs = latest?.start_time
    ? new Date(latest.start_time).getTime()
    : 0;

  return {
    running,
    retryAfterSeconds:
      latestStartMs && nowMs - latestStartMs < MANUAL_COOLDOWN_MS
        ? Math.max(
            1,
            Math.ceil((MANUAL_COOLDOWN_MS - (nowMs - latestStartMs)) / 1000)
          )
        : null,
  };
}

async function clearStaleRunningSyncRuns(sbAdmin: any, wsId: string) {
  const staleThresholdIso = new Date(
    Date.now() - RUNNING_LOCK_MS
  ).toISOString();

  const { error } = await sbAdmin
    .from('calendar_sync_dashboard')
    .update({
      status: 'failed',
      end_time: new Date().toISOString(),
      error_message: 'Sync run timed out before completion',
    })
    .eq('ws_id', wsId)
    .eq('status', 'running')
    .lt('start_time', staleThresholdIso);

  if (error) {
    console.error('Failed to clear stale calendar sync runs', {
      wsId,
      error,
    });
  }
}

async function resolveSyncTriggerUserId(args: {
  sbAdmin: any;
  wsId: string;
  fallbackUserId: string | null;
}) {
  if (args.fallbackUserId) {
    return args.fallbackUserId;
  }

  const { data: workspaceRow, error } = await args.sbAdmin
    .from('workspaces')
    .select('creator_id')
    .eq('id', args.wsId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return workspaceRow?.creator_id ?? null;
}

async function syncMicrosoftInbound(args: {
  sbAdmin: any;
  wsId: string;
  rangeStart: string;
  rangeEnd: string;
}) {
  const { data: tokenRows, error: tokenError } = await args.sbAdmin
    .from('calendar_auth_tokens')
    .select('id, access_token')
    .eq('ws_id', args.wsId)
    .eq('provider', 'microsoft')
    .eq('is_active', true);

  if (tokenError) {
    throw tokenError;
  }

  const tokens = (tokenRows ?? []) as MicrosoftTokenRow[];
  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  for (const token of tokens) {
    const { data: connections, error: connectionError } = await args.sbAdmin
      .from('calendar_connections')
      .select('calendar_id, color')
      .eq('ws_id', args.wsId)
      .eq('auth_token_id', token.id)
      .eq('is_enabled', true);

    if (connectionError) {
      throw connectionError;
    }

    const graphClient = createGraphClient(token.access_token);
    for (const connection of (connections ?? []) as CalendarConnectionRow[]) {
      const events = await fetchMicrosoftEvents(
        graphClient,
        connection.calendar_id,
        args.rangeStart,
        args.rangeEnd
      );

      const eventIds = new Set(events.map((event) => event.id));
      const payload = events
        .filter((event) => !event.isCancelled)
        .map((event) => {
          const converted = convertMicrosoftEventToWorkspaceFormat(
            event,
            args.wsId,
            connection.calendar_id,
            connection.color ?? undefined
          );

          return sanitizeWorkspaceCalendarEventFields({
            ws_id: args.wsId,
            title: converted.title,
            description: converted.description ?? '',
            start_at: converted.start_at,
            end_at: converted.end_at,
            color: converted.color,
            location: converted.location,
            provider: 'microsoft' as const,
            external_event_id: event.id,
            external_calendar_id: connection.calendar_id,
            source_calendar_id: connection.calendar_id,
            google_event_id: event.id,
            google_calendar_id: connection.calendar_id,
          });
        });

      if (payload.length > 0) {
        const { data: upserted, error: upsertError } = await (
          args.sbAdmin as any
        )
          .from('workspace_calendar_events')
          .upsert(payload, {
            onConflict: 'ws_id,provider,external_calendar_id,external_event_id',
          })
          .select('id');

        if (upsertError) {
          throw upsertError;
        }

        updated += (upserted as Array<{ id: string }> | null)?.length ?? 0;
      }

      const { data: existingRows, error: existingError } = await args.sbAdmin
        .from('workspace_calendar_events')
        .select('id, external_event_id')
        .eq('ws_id', args.wsId)
        .eq('provider', 'microsoft')
        .eq('external_calendar_id', connection.calendar_id)
        .gte('start_at', args.rangeStart)
        .lte('start_at', args.rangeEnd);

      if (existingError) {
        throw existingError;
      }

      const idsToDelete =
        ((existingRows ?? []) as ExistingExternalEventRow[])
          ?.filter(
            (row) =>
              row.external_event_id && !eventIds.has(row.external_event_id)
          )
          .map((row) => row.id) ?? [];

      if (idsToDelete.length > 0) {
        const { error: deleteError } = await args.sbAdmin
          .from('workspace_calendar_events')
          .delete()
          .in('id', idsToDelete);

        if (deleteError) {
          throw deleteError;
        }

        deleted += idsToDelete.length;
      }

      inserted += payload.length;
    }
  }

  return { inserted, updated, deleted, processedAccounts: tokens.length };
}

async function syncGoogleInbound(args: {
  sbAdmin: any;
  wsId: string;
  rangeStart: string;
  rangeEnd: string;
  userIdForFallback: string;
}) {
  const { data: connections, error } = await args.sbAdmin
    .from('calendar_connections')
    .select('calendar_id, auth_token_id')
    .eq('ws_id', args.wsId)
    .eq('is_enabled', true)
    .not('auth_token_id', 'is', null);

  if (error) {
    throw error;
  }

  const googleConnections = (
    (connections ?? []) as CalendarConnectionRow[]
  ).filter((connection) => connection.auth_token_id);

  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  for (const connection of googleConnections) {
    const result = await performIncrementalActiveSync(
      args.wsId,
      args.userIdForFallback,
      connection.calendar_id,
      new Date(args.rangeStart),
      new Date(args.rangeEnd),
      undefined,
      connection.auth_token_id
    );

    if (result instanceof NextResponse) {
      const body = await result.json();
      throw new Error(body.error || 'Google sync failed');
    }

    inserted += result.eventsInserted;
    updated += result.eventsUpdated;
    deleted += result.eventsDeleted;
  }

  return {
    inserted,
    updated,
    deleted,
    processedConnections: googleConnections.length,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<RouteParams> }
) {
  let dashboardRunId: string | null = null;
  let sbAdmin: any = null;
  try {
    const { wsId } = await params;

    if (!validate(wsId)) {
      return jsonError('Invalid workspace ID', 400);
    }

    const access = await verifyWorkspaceAccess(request, wsId);
    if (access instanceof NextResponse) {
      return access;
    }

    const body = await request.json().catch(() => ({}));
    const direction = (body.direction ?? 'inbound') as SyncDirection;
    const source = body.source === 'cron' ? 'vercel_cron' : 'manual';

    sbAdmin = (await createAdminClient()) as any;
    await clearStaleRunningSyncRuns(sbAdmin, wsId);
    const recentState = await getRecentRunState(sbAdmin, wsId);
    const triggeredBy = await resolveSyncTriggerUserId({
      sbAdmin,
      wsId,
      fallbackUserId: access.userId,
    });

    if (!triggeredBy) {
      return jsonError('Failed to resolve sync actor', 500);
    }

    if (recentState.running) {
      return NextResponse.json(
        {
          ok: true,
          alreadyRunning: true,
          code: 'sync_already_running',
          retryAfterSeconds: recentState.retryAfterSeconds,
        },
        { status: 202 }
      );
    }

    if (recentState.retryAfterSeconds && source !== 'vercel_cron') {
      return jsonError('Sync cooldown active', 429, {
        code: 'sync_cooldown_active',
        retryAfterSeconds: recentState.retryAfterSeconds,
      });
    }

    const { data: dashboardRow, error: dashboardInsertError } = await (
      sbAdmin as any
    )
      .from('calendar_sync_dashboard')
      .insert({
        ws_id: wsId,
        triggered_by: triggeredBy,
        status: 'running',
        type: source === 'vercel_cron' ? 'background' : 'manual',
        source: direction,
        triggered_from: source,
        start_time: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (dashboardInsertError || !dashboardRow) {
      console.error('Failed to insert calendar sync dashboard row', {
        wsId,
        direction,
        source,
        triggeredBy,
        dashboardInsertError,
      });
      return jsonError('Failed to start sync run', 500);
    }
    dashboardRunId = (dashboardRow as { id: string }).id;

    const rangeStart = new Date(
      Date.now() - 60 * 24 * 60 * 60 * 1000
    ).toISOString();
    const rangeEnd = new Date(
      Date.now() + 90 * 24 * 60 * 60 * 1000
    ).toISOString();

    const googleSummary =
      direction === 'inbound' || direction === 'both'
        ? await syncGoogleInbound({
            sbAdmin,
            wsId,
            rangeStart,
            rangeEnd,
            userIdForFallback: access.userId ?? wsId,
          })
        : {
            inserted: 0,
            updated: 0,
            deleted: 0,
            processedConnections: 0,
          };

    const microsoftSummary =
      direction === 'inbound' || direction === 'both'
        ? await syncMicrosoftInbound({
            sbAdmin,
            wsId,
            rangeStart,
            rangeEnd,
          })
        : {
            inserted: 0,
            updated: 0,
            deleted: 0,
            processedAccounts: 0,
          };

    await (sbAdmin as any)
      .from('calendar_sync_dashboard')
      .update({
        status: 'success',
        end_time: new Date().toISOString(),
        inserted_events: googleSummary.inserted + microsoftSummary.inserted,
        updated_events: googleSummary.updated + microsoftSummary.updated,
        deleted_events: googleSummary.deleted + microsoftSummary.deleted,
        calendar_connection_count:
          googleSummary.processedConnections +
          microsoftSummary.processedAccounts,
      })
      .eq('id', dashboardRunId);

    return NextResponse.json({
      ok: true,
      direction,
      summary: {
        google: googleSummary,
        microsoft: microsoftSummary,
      },
    });
  } catch (error) {
    console.error('Error in workspace calendar sync route:', error);
    if (sbAdmin && dashboardRunId) {
      await sbAdmin
        .from('calendar_sync_dashboard')
        .update({
          status: 'failed',
          end_time: new Date().toISOString(),
          error_message:
            error instanceof Error ? error.message : 'Internal server error',
        })
        .eq('id', dashboardRunId);
    }
    return jsonError(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
}
