import { createGraphClient } from '@tuturuuu/microsoft';
import {
  convertMicrosoftEventToWorkspaceFormat,
  fetchMicrosoftEvents,
} from '@tuturuuu/microsoft/calendar';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { type NextRequest, NextResponse } from 'next/server';
import { validate } from 'uuid';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { performIncrementalActiveSync } from '@/lib/calendar/incremental-active-sync';
import { createProviderEvent } from '@/lib/calendar/provider-writes';
import { sanitizeWorkspaceCalendarEventFields } from '@/lib/calendar/sync-field-limits';
import {
  getCalendarSyncPreferences,
  resolveOutboundSyncSource,
} from '@/lib/calendar/sync-preferences';
import { decryptEventsFromStorage } from '@/lib/workspace-encryption';

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
type GoogleTokenRow = { id: string };
type CalendarConnectionRow = {
  calendar_id: string;
  color?: string | null;
  auth_token_id?: string | null;
  workspace_calendar_id?: string | null;
  access_role?: string | null;
  sync_delete_enabled?: boolean | null;
  sync_inbound_enabled?: boolean | null;
};
type ExistingExternalEventRow = {
  id: string;
  external_event_id: string | null;
};
type LocalEventRow = {
  id: string;
  title: string;
  description: string;
  location: string | null;
  start_at: string;
  end_at: string;
  color: string | null;
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

  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: true,
  });
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

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
  settingsAvailable: boolean;
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
      .select(
        args.settingsAvailable
          ? 'calendar_id, color, workspace_calendar_id, access_role, sync_delete_enabled, sync_inbound_enabled'
          : 'calendar_id, color, workspace_calendar_id, access_role'
      )
      .eq('ws_id', args.wsId)
      .eq('auth_token_id', token.id)
      .eq('is_enabled', true);

    if (connectionError) {
      throw connectionError;
    }

    const graphClient = createGraphClient(token.access_token);
    const enabledConnections = (
      (connections ?? []) as CalendarConnectionRow[]
    ).filter((connection) => connection.sync_inbound_enabled !== false);

    for (const connection of enabledConnections) {
      const events = await fetchMicrosoftEvents(
        graphClient,
        connection.calendar_id,
        args.rangeStart,
        args.rangeEnd
      );

      const eventIds = new Set(
        events.filter((event) => !event.isCancelled).map((event) => event.id)
      );
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
            source_calendar_id: connection.workspace_calendar_id ?? null,
            google_event_id: null,
            google_calendar_id: null,
            ...(args.settingsAvailable
              ? {
                  external_updated_at: event.lastModifiedDateTime ?? null,
                  last_synced_at: new Date().toISOString(),
                  sync_error: null,
                  sync_status: 'synced',
                }
              : {}),
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

      if (connection.sync_delete_enabled !== false) {
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
  settingsAvailable: boolean;
}) {
  const { data: tokenRows, error: tokenError } = await args.sbAdmin
    .from('calendar_auth_tokens')
    .select('id')
    .eq('ws_id', args.wsId)
    .eq('provider', 'google')
    .eq('is_active', true);

  if (tokenError) {
    throw tokenError;
  }

  const googleTokenIds = ((tokenRows ?? []) as GoogleTokenRow[]).map(
    (token) => token.id
  );

  if (googleTokenIds.length === 0) {
    return {
      inserted: 0,
      updated: 0,
      deleted: 0,
      processedConnections: 0,
    };
  }

  const { data: connections, error: connectionError } = await args.sbAdmin
    .from('calendar_connections')
    .select(
      args.settingsAvailable
        ? 'calendar_id, auth_token_id, workspace_calendar_id, access_role, sync_delete_enabled, sync_inbound_enabled'
        : 'calendar_id, auth_token_id, workspace_calendar_id, access_role'
    )
    .eq('ws_id', args.wsId)
    .eq('is_enabled', true)
    .in('auth_token_id', googleTokenIds);

  if (connectionError) {
    throw connectionError;
  }

  const googleConnections = (
    (connections ?? []) as CalendarConnectionRow[]
  ).filter(
    (connection) =>
      connection.auth_token_id && connection.sync_inbound_enabled !== false
  );

  let inserted = 0;
  let updated = 0;
  let deleted = 0;
  let failedConnections = 0;
  let firstConnectionError: unknown;

  for (const connection of googleConnections) {
    try {
      const result = await performIncrementalActiveSync(
        args.wsId,
        args.userIdForFallback,
        connection.calendar_id,
        new Date(args.rangeStart),
        new Date(args.rangeEnd),
        undefined,
        connection.auth_token_id,
        connection.workspace_calendar_id ?? null,
        {
          syncDeletes: connection.sync_delete_enabled !== false,
        }
      );

      if (result instanceof NextResponse) {
        const body = await result.json();
        throw new Error(body.error || 'Google sync failed');
      }

      inserted += result.eventsInserted;
      updated += result.eventsUpdated;
      deleted += result.eventsDeleted;
    } catch (error) {
      failedConnections += 1;
      firstConnectionError ??= error;
      console.warn('Google calendar connection sync failed', {
        wsId: args.wsId,
        authTokenId: connection.auth_token_id,
        calendarId: connection.calendar_id,
        error,
      });
    }
  }

  if (
    googleConnections.length > 0 &&
    failedConnections === googleConnections.length
  ) {
    throw firstConnectionError instanceof Error
      ? firstConnectionError
      : new Error('Google sync failed for all connected calendars');
  }

  return {
    inserted,
    updated,
    deleted,
    processedConnections: googleConnections.length - failedConnections,
    failedConnections,
  };
}

async function syncTuturuuuOutbound(args: {
  sbAdmin: any;
  wsId: string;
  userId: string;
  rangeStart: string;
  rangeEnd: string;
  settingsAvailable: boolean;
}) {
  if (!args.settingsAvailable) {
    return {
      created: 0,
      failed: 0,
      processedEvents: 0,
      provider: null as string | null,
    };
  }

  const source = await resolveOutboundSyncSource({
    sbAdmin: args.sbAdmin,
    wsId: args.wsId,
    userId: args.userId,
  });

  if (!source) {
    return {
      created: 0,
      failed: 0,
      processedEvents: 0,
      provider: null as string | null,
    };
  }

  const { data: rows, error } = await args.sbAdmin
    .from('workspace_calendar_events')
    .select('*')
    .eq('ws_id', args.wsId)
    .or('provider.eq.tuturuuu,provider.is.null')
    .is('external_event_id', null)
    .gte('start_at', args.rangeStart)
    .lte('start_at', args.rangeEnd)
    .in('sync_status', ['local_only', 'failed'])
    .order('start_at', { ascending: true })
    .limit(250);

  if (error) throw error;

  const localEvents = (await decryptEventsFromStorage(
    (rows ?? []) as LocalEventRow[],
    args.wsId
  )) as LocalEventRow[];

  let created = 0;
  let failed = 0;

  for (const event of localEvents) {
    try {
      const providerResult = await createProviderEvent({
        source,
        event: {
          title: event.title,
          description: event.description ?? '',
          location: event.location ?? '',
          start_at: event.start_at,
          end_at: event.end_at,
        },
      });

      if (!providerResult) continue;

      const { error: updateError } = await args.sbAdmin
        .from('workspace_calendar_events')
        .update({
          provider: providerResult.provider,
          source_calendar_id: source.workspaceCalendarId,
          external_calendar_id: providerResult.externalCalendarId,
          external_event_id: providerResult.externalEventId,
          google_calendar_id:
            providerResult.provider === 'google'
              ? providerResult.externalCalendarId
              : null,
          google_event_id:
            providerResult.provider === 'google'
              ? providerResult.externalEventId
              : null,
          last_synced_at: new Date().toISOString(),
          sync_error: null,
          sync_status: 'synced',
        })
        .eq('id', event.id)
        .eq('ws_id', args.wsId);

      if (updateError) throw updateError;
      created += 1;
    } catch (syncError) {
      failed += 1;
      const message =
        syncError instanceof Error
          ? syncError.message
          : 'External calendar sync failed';

      await args.sbAdmin
        .from('workspace_calendar_events')
        .update({
          sync_error: message.slice(0, 1000),
          sync_status: 'failed',
        })
        .eq('id', event.id)
        .eq('ws_id', args.wsId);

      console.warn('Failed to outbound-sync Tuturuuu calendar event', {
        wsId: args.wsId,
        eventId: event.id,
        provider: source.provider,
        syncError,
      });
    }
  }

  return {
    created,
    failed,
    processedEvents: localEvents.length,
    provider: source.provider,
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
    const syncPreferences = await getCalendarSyncPreferences({
      sbAdmin,
      wsId,
      userId: triggeredBy,
    });
    const shouldRunInbound =
      syncPreferences.inboundSyncEnabled &&
      (direction === 'inbound' || direction === 'both');
    const shouldRunOutbound =
      syncPreferences.outboundSyncEnabled &&
      (direction === 'outbound' || direction === 'both');

    const googleSummary = shouldRunInbound
      ? await syncGoogleInbound({
          sbAdmin,
          wsId,
          rangeStart,
          rangeEnd,
          userIdForFallback: triggeredBy,
          settingsAvailable: syncPreferences.settingsAvailable,
        })
      : {
          inserted: 0,
          updated: 0,
          deleted: 0,
          processedConnections: 0,
          failedConnections: 0,
        };

    const microsoftSummary = shouldRunInbound
      ? await syncMicrosoftInbound({
          sbAdmin,
          wsId,
          rangeStart,
          rangeEnd,
          settingsAvailable: syncPreferences.settingsAvailable,
        })
      : {
          inserted: 0,
          updated: 0,
          deleted: 0,
          processedAccounts: 0,
        };

    const outboundSummary = shouldRunOutbound
      ? await syncTuturuuuOutbound({
          sbAdmin,
          wsId,
          userId: triggeredBy,
          rangeStart,
          rangeEnd,
          settingsAvailable: syncPreferences.settingsAvailable,
        })
      : {
          created: 0,
          failed: 0,
          processedEvents: 0,
          provider: null as string | null,
        };

    await (sbAdmin as any)
      .from('calendar_sync_dashboard')
      .update({
        status: 'success',
        end_time: new Date().toISOString(),
        inserted_events: googleSummary.inserted + microsoftSummary.inserted,
        updated_events:
          googleSummary.updated +
          microsoftSummary.updated +
          outboundSummary.created,
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
        outbound: outboundSummary,
      },
    });
  } catch (error) {
    console.error('Error in workspace calendar sync route', { error });
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
