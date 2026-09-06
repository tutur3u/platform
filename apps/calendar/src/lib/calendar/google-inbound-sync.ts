import { NextResponse } from 'next/server';
import { performIncrementalActiveSync } from './incremental-active-sync';
import {
  CalendarProviderSyncError,
  classifyCalendarSyncError,
} from './sync-errors';

type GoogleTokenRow = { id: string };
type CalendarConnectionRow = {
  calendar_id: string;
  auth_token_id?: string | null;
  workspace_calendar_id?: string | null;
  sync_delete_enabled?: boolean | null;
  sync_inbound_enabled?: boolean | null;
};

export async function syncGoogleInbound(args: {
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
        throw new CalendarProviderSyncError(
          body.error || 'Google sync failed',
          result.status === 401 ? 'auth' : 'unknown'
        );
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
    failureType: firstConnectionError
      ? classifyCalendarSyncError(firstConnectionError)
      : null,
  };
}
