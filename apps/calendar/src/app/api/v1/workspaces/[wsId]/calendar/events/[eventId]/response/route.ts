import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MeetingResponseError,
  respondToProviderMeeting,
} from '@/lib/calendar/meeting-provider-response';
import { resolveCalendarSourceForEvent } from '@/lib/calendar/source-resolver';
import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';

const responseSchema = z
  .object({
    response: z.enum(['accepted', 'declined', 'tentative']),
  })
  .strict();
const headers = { 'Cache-Control': 'private, no-store' };

export async function POST(
  request: Request,
  context: {
    params: Promise<{ wsId: string; eventId: string }>;
  }
) {
  const { wsId: rawWsId, eventId } = await context.params;
  const access = await authorizeCalendarEventManagement(request, rawWsId);
  if ('error' in access) return access.error;
  if (!z.guid().safeParse(eventId).success) {
    return NextResponse.json(
      { error: 'Invalid event ID' },
      { status: 400, headers }
    );
  }
  const input = responseSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!input.success) {
    return NextResponse.json(
      { error: 'Invalid meeting response' },
      { status: 400, headers }
    );
  }
  const { sbAdmin, wsId, userId } = access;
  try {
    const { data: event, error } = await sbAdmin
      .from('workspace_calendar_events')
      .select('*')
      .eq('id', eventId)
      .eq('ws_id', wsId)
      .maybeSingle();
    if (error) throw error;
    if (!event)
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404, headers }
      );
    const source = await resolveCalendarSourceForEvent({
      sbAdmin,
      wsId,
      userId,
      event,
    });
    const externalEventId = event.external_event_id ?? event.google_event_id;
    if (!externalEventId || source.provider === 'tuturuuu') {
      return NextResponse.json(
        { error: 'This invitation does not have a connected calendar account' },
        { status: 409, headers }
      );
    }
    await respondToProviderMeeting({
      source,
      externalEventId,
      response: input.data.response,
    });
    return NextResponse.json({ response: input.data.response }, { headers });
  } catch (error) {
    if (error instanceof MeetingResponseError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers }
      );
    }
    console.error('Meeting response failed', { wsId, eventId });
    return NextResponse.json(
      { error: 'Unable to send meeting response' },
      { status: 502, headers }
    );
  }
}
