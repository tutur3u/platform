import type { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { performIncrementalActiveSync } from './incremental-active-sync';
import {
  checkProviderSyncBudget,
  MAX_SYNC_CONNECTIONS,
  providerSyncSignal,
  rotatingSyncBatch,
} from './provider-sync-budget';
import type { CalendarSyncFailure } from './sync-diagnostics';
import {
  CalendarProviderSyncError,
  classifyCalendarSyncError,
  isInvalidCalendarGrant,
} from './sync-errors';

type GoogleTokenRow = { id: string; refresh_token: string };
type CalendarConnectionRow = {
  id: string;
  calendar_name: string;
  calendar_id: string;
  auth_token_id?: string | null;
  workspace_calendar_id?: string | null;
  sync_delete_enabled?: boolean | null;
  sync_inbound_enabled?: boolean | null;
};

export async function syncGoogleInbound(args: {
  sbAdmin: Awaited<ReturnType<typeof createAdminClient>>;
  wsId: string;
  rangeStart: string;
  rangeEnd: string;
  userIdForFallback: string;
  settingsAvailable: boolean;
}) {
  const { data: tokenRows, error: tokenError } = await args.sbAdmin
    .from('calendar_auth_tokens')
    .select('id, refresh_token')
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
      failedConnections: 0,
      deferredConnections: 0,
      failureType: null,
      failedCalendars: [] as CalendarSyncFailure[],
    };
  }

  const { data: connections, error: connectionError } = await args.sbAdmin
    .from('calendar_connections')
    .select(
      args.settingsAvailable
        ? 'id, calendar_name, calendar_id, auth_token_id, workspace_calendar_id, access_role, sync_delete_enabled, sync_inbound_enabled'
        : 'id, calendar_name, calendar_id, auth_token_id, workspace_calendar_id, access_role'
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
  const failedCalendars: CalendarSyncFailure[] = [];
  let firstConnectionError: unknown;
  let authError: unknown;

  const rejectedAccounts = new Set<string>();
  const batch = providerSyncSignal()
    ? rotatingSyncBatch(
        [...googleConnections].sort((a, b) => a.id.localeCompare(b.id)),
        MAX_SYNC_CONNECTIONS
      )
    : googleConnections;
  for (const connection of batch) {
    try {
      checkProviderSyncBudget();
      if (
        connection.auth_token_id &&
        rejectedAccounts.has(connection.auth_token_id)
      ) {
        throw new CalendarProviderSyncError(
          'Reconnect Google calendar',
          'auth'
        );
      }
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
        throw new CalendarProviderSyncError(
          body.error || 'Google sync failed',
          classifyCalendarSyncError({
            code: result.status,
            message: body.error,
          })
        );
      }

      inserted += result.eventsInserted;
      updated += result.eventsUpdated;
      deleted += result.eventsDeleted;
    } catch (error) {
      if (isInvalidCalendarGrant(error) && connection.auth_token_id) {
        rejectedAccounts.add(connection.auth_token_id);
        const token = (tokenRows as GoogleTokenRow[]).find(
          (row) => row.id === connection.auth_token_id
        );
        if (token) {
          const { error: disableError } = await args.sbAdmin
            .from('calendar_auth_tokens')
            .update({ is_active: false })
            .eq('id', token.id)
            .eq('ws_id', args.wsId)
            .eq('refresh_token', token.refresh_token);
          if (disableError)
            console.error(
              'Failed to disable revoked Google calendar credential'
            );
        }
      }
      failedConnections += 1;
      failedCalendars.push({
        connectionId: connection.id,
        calendarName: connection.calendar_name,
        code: classifyCalendarSyncError(error),
      });
      firstConnectionError ??= error;
      if (classifyCalendarSyncError(error) === 'auth') authError ??= error;
      console.warn('Google calendar connection sync failed', {
        wsId: args.wsId,
        authTokenId: connection.auth_token_id,
        connectionId: connection.id,
        code: classifyCalendarSyncError(error),
      });
    }
  }

  return {
    inserted,
    updated,
    deleted,
    processedConnections: batch.length - failedConnections,
    deferredConnections: googleConnections.length - batch.length,
    failedConnections,
    failedCalendars,
    failureType: firstConnectionError
      ? classifyCalendarSyncError(authError ?? firstConnectionError)
      : null,
  };
}
