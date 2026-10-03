import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { unsupportedProviderSaga } from '@/lib/calendar/google-color-operations/provider-saga-routes';
import { getCalendarRetainedGeneration } from '@/lib/calendar/google-color-operations/retained-generation-request-access';
import { operationFailure } from '@/lib/calendar/google-color-operations/route-handlers';
import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';

/** Resolve legacy identifiers through the authenticated client's RLS before
 * passing the exact workspace/event into the freshly authorized mutation path. */
export async function authorizeLegacySync(
  request: Request,
  supabase: TypedSupabaseClient,
  input: { eventId?: string; googleEventId?: string; wsId?: string },
  options: { recoverable?: boolean } = {}
) {
  if (input.eventId && !z.guid().safeParse(input.eventId).success)
    return {
      error: NextResponse.json({ error: 'Invalid event ID' }, { status: 400 }),
    };
  let event: {
    id: string;
    ws_id: string;
    google_event_id: string | null;
  } | null = null;
  if (input.eventId || input.googleEventId) {
    let query = supabase
      .from('workspace_calendar_events')
      .select('id, ws_id, google_event_id');
    query = input.eventId
      ? query.eq('id', input.eventId)
      : query.eq('google_event_id', input.googleEventId!);
    const result = await query.maybeSingle();
    if (result.error || !result.data)
      return {
        error: NextResponse.json(
          { error: 'Event unavailable' },
          { status: 404 }
        ),
      };
    event = result.data;
    if (input.googleEventId && event.google_event_id !== input.googleEventId)
      return {
        error: NextResponse.json(
          { error: 'Event identity changed' },
          { status: 409 }
        ),
      };
  }
  const wsId = event?.ws_id ?? input.wsId;
  if (!wsId)
    return {
      error: NextResponse.json(
        { error: 'Missing workspace ID' },
        { status: 400 }
      ),
    };
  const access = await authorizeCalendarEventManagement(request, wsId);
  if ('error' in access) return access;
  if (event && !options.recoverable) {
    try {
      if (await getCalendarRetainedGeneration(request, wsId, event.id))
        return { error: unsupportedProviderSaga() };
    } catch (error) {
      return { error: operationFailure(error) };
    }
  }
  return { ...access, event };
}
