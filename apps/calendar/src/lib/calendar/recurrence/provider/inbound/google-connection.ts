import type { calendar_v3 } from '@tuturuuu/google';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { UnsupportedCalendarRecurrenceError } from '@tuturuuu/utils/calendar-recurrence';
import { CalendarSeriesError } from '../../service';
import { readGoogleSeriesSnapshot } from './google-snapshot';
import { prepareInboundProviderConnection } from './service';
import { ProviderSeriesDeletedError } from './snapshot-errors';

/** Canonical reconciliation precedes ordinary expanded-instance persistence.
 * A deferred bound master remains fenced rather than being duplicated. */
export async function reconcileGoogleConnectionSeries(args: {
  supabase: TypedSupabaseClient;
  wsId: string;
  authTokenId: string;
  actorId: string;
  calendarId: string;
  api: calendar_v3.Calendar;
  events: calendar_v3.Schema$Event[];
}) {
  if (process.env.CALENDAR_PROVIDER_SERIES_OPERATIONS_ENABLED !== 'true')
    return args.events;
  const { data: connection, error } = await args.supabase
    .from('calendar_connections')
    .select('id,color')
    .eq('ws_id', args.wsId)
    .eq('provider', 'google')
    .eq('auth_token_id', args.authTokenId)
    .eq('calendar_id', args.calendarId)
    .eq('is_enabled', true)
    .eq('sync_inbound_enabled', true)
    .maybeSingle();
  if (error || !connection)
    throw new CalendarSeriesError(
      'Provider recurrence source unavailable',
      503,
      'SOURCE_UNAVAILABLE'
    );
  const service = await prepareInboundProviderConnection({
    supabase: args.supabase,
    wsId: args.wsId,
    actorId: args.actorId,
    connectionId: connection.id,
    provider: 'google',
    calendarId: args.calendarId,
    color: connection.color,
  });
  const masters = new Set(
    args.events.flatMap((event) =>
      event.recurringEventId
        ? [event.recurringEventId]
        : event.id &&
            (event.recurrence?.length ||
              service.bindings.some((value) => value.master_id === event.id))
          ? [event.id]
          : []
    )
  );
  if (masters.size > 1000)
    throw new RangeError('Provider recurrence master bound exceeded');
  const handled = new Set<string>();
  for (const masterId of masters) {
    try {
      const snapshot = await readGoogleSeriesSnapshot({
        api: args.api,
        calendarId: args.calendarId,
        masterId,
        authorize: service.authorize,
      });
      await service.publish({
        observation: snapshot.observation,
        master: snapshot.master as Record<string, unknown>,
        rawExceptions: snapshot.exceptions as Record<string, unknown>[],
        representedInstanceIds: [
          ...args.events
            .filter(
              (event) =>
                event.id === masterId || event.recurringEventId === masterId
            )
            .flatMap((event) => (event.id ? [event.id] : [])),
          ...snapshot.exceptions.flatMap((event) =>
            event.id ? [event.id] : []
          ),
          masterId,
        ],
      });
      handled.add(masterId);
    } catch (error) {
      const bound = service.bindings.some(
        (value) => value.master_id === masterId
      );
      const status =
        (error as { code?: number; response?: { status?: number } })?.code ??
        (error as { response?: { status?: number } })?.response?.status;
      if (
        (status === 404 ||
          status === 410 ||
          error instanceof ProviderSeriesDeletedError) &&
        bound
      ) {
        await service.deleted(masterId);
        handled.add(masterId);
        continue;
      }
      if (
        !bound &&
        (error instanceof UnsupportedCalendarRecurrenceError ||
          error instanceof RangeError)
      )
        continue;
      // Provider SDK errors can carry credential/request objects. Keep the raw
      // failure out of existing sync logs and reject this publication attempt.
      if (error instanceof CalendarSeriesError) throw error;
      throw new CalendarSeriesError(
        'Provider recurring snapshot unavailable',
        503,
        'PROVIDER_SNAPSHOT_UNAVAILABLE'
      );
    }
  }
  return args.events.filter(
    (event) => !handled.has(event.recurringEventId ?? event.id ?? '')
  );
}
