import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AttendeeSnapshotError,
  readAttendeeSnapshot,
} from '@/lib/calendar/attendee-snapshot';
import {
  assertLegacyCalendarWriteAllowed,
  LegacyCalendarWriteError,
} from '@/lib/calendar/legacy-provider-generation-guard';
import { resolveCalendarSourceForEvent } from '@/lib/calendar/source-resolver';
import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string; eventId: string }> }
) {
  await connection();
  const { wsId: rawWsId, eventId } = await params;
  const access = await authorizeCalendarEventManagement(request, rawWsId);
  if ('error' in access) return access.error;
  if (
    !z.guid().safeParse(eventId).success ||
    new URL(request.url).searchParams.size
  )
    return NextResponse.json(
      { error: 'Invalid attendee snapshot request' },
      { status: 400 }
    );
  try {
    const { sbAdmin, wsId, userId } = access;
    await assertLegacyCalendarWriteAllowed({
      ...access,
      eventIds: [eventId],
      blockCandidate:
        process.env.CALENDAR_GOOGLE_COLOR_OPERATIONS_ENABLED === 'true',
    });
    const { data: event, error } = await sbAdmin
      .from('workspace_calendar_events')
      .select(
        'id, provider, source_calendar_id, external_calendar_id, external_event_id, scheduling_metadata'
      )
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .maybeSingle();
    if (error) throw new AttendeeSnapshotError(503);
    if (!event) throw new AttendeeSnapshotError(404);
    const meta = z
      .record(z.string(), z.unknown())
      .nullable()
      .safeParse(event.scheduling_metadata);
    if (
      !meta.success ||
      meta.data?.google_color ||
      meta.data?.providerColor ||
      meta.data?.provider_recurrence ||
      meta.data?.meeting_delivery === 'pending' ||
      !event.source_calendar_id ||
      !event.external_calendar_id ||
      !event.external_event_id ||
      (event.provider !== 'google' && event.provider !== 'microsoft')
    )
      throw new AttendeeSnapshotError(409);
    const series = await sbAdmin.rpc('calendar_provider_series_is_readonly', {
      p_ws_id: wsId,
      p_actor_id: userId,
      p_event_id: eventId,
    });
    if (series.error || series.data !== false)
      throw new AttendeeSnapshotError(series.error ? 503 : 409);
    const source = await resolveCalendarSourceForEvent({ ...access, event });
    if (
      source.provider === 'tuturuuu' ||
      source.provider !== event.provider ||
      source.workspaceCalendarId !== event.source_calendar_id ||
      source.externalCalendarId !== event.external_calendar_id ||
      !source.accountEmail
    )
      throw new AttendeeSnapshotError(409);
    const snapshot = await readAttendeeSnapshot(
      source,
      eventId,
      event.external_event_id
    );
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Calendar attendee snapshot is unavailable' },
      {
        status:
          error instanceof AttendeeSnapshotError ||
          error instanceof LegacyCalendarWriteError
            ? error.status
            : 503,
      }
    );
  }
}
