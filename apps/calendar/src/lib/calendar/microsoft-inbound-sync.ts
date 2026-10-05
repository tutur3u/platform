import { createGraphClient } from '@tuturuuu/microsoft';
import {
  convertMicrosoftEventToWorkspaceFormat,
  fetchMicrosoftEvents,
} from '@tuturuuu/microsoft/calendar';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { providerReadonlyProjection } from '@tuturuuu/utils/calendar-provider-readonly';
import { reconcileGraphConnectionSeries } from './recurrence/provider/inbound/graph-connection';
import { sanitizeWorkspaceCalendarEventFields } from './sync-field-limits';
import { type CalendarAuthToken, ensureValidToken } from './token-refresh';

type CalendarConnectionRow = {
  id: string;
  calendar_id: string;
  color?: string | null;
  workspace_calendar_id?: string | null;
  sync_delete_enabled?: boolean | null;
  sync_inbound_enabled?: boolean | null;
};
type ExistingExternalEventRow = {
  id: string;
  external_event_id: string | null;
};

export async function syncMicrosoftInbound(args: {
  sbAdmin: TypedSupabaseClient;
  wsId: string;
  rangeStart: string;
  rangeEnd: string;
  settingsAvailable: boolean;
}) {
  const { data: tokenRows, error: tokenError } = await args.sbAdmin
    .from('calendar_auth_tokens')
    .select('*')
    .eq('ws_id', args.wsId)
    .eq('provider', 'microsoft')
    .eq('is_active', true);

  if (tokenError) {
    throw tokenError;
  }

  const tokens = (tokenRows ?? []) as CalendarAuthToken[];
  let inserted = 0;
  let updated = 0;
  let deleted = 0;

  for (const token of tokens) {
    const connectionQuery = args.sbAdmin.from('calendar_connections');
    const selectedConnections = args.settingsAvailable
      ? connectionQuery.select(
          'id,calendar_id,color,workspace_calendar_id,sync_delete_enabled,sync_inbound_enabled'
        )
      : connectionQuery.select('id,calendar_id,color,workspace_calendar_id');
    const { data: connections, error: connectionError } =
      await selectedConnections
        .eq('ws_id', args.wsId)
        .eq('auth_token_id', token.id)
        .eq('is_enabled', true);

    if (connectionError) {
      throw connectionError;
    }

    const refreshed = await ensureValidToken(args.sbAdmin, token);
    if (refreshed.error) {
      throw new Error('Microsoft calendar credential refresh failed');
    }
    const graphClient = createGraphClient(refreshed.accessToken);
    const enabledConnections = (
      (connections ?? []) as CalendarConnectionRow[]
    ).filter((connection) => connection.sync_inbound_enabled !== false);

    for (const connection of enabledConnections) {
      let events = await fetchMicrosoftEvents(
        graphClient,
        connection.calendar_id,
        args.rangeStart,
        args.rangeEnd
      );

      events = await reconcileGraphConnectionSeries({
        access: {
          supabase: args.sbAdmin,
          wsId: args.wsId,
          actorId: token.user_id,
          connectionId: connection.id,
          provider: 'microsoft',
          calendarId: connection.calendar_id,
          color: connection.color,
        },
        api: graphClient,
        from: args.rangeStart,
        to: args.rangeEnd,
        legacyEvents: events,
      });
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
            ...providerReadonlyProjection(event),
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
        const { data: upserted, error: upsertError } = await args.sbAdmin
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
