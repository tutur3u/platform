import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthorizedCalendarLinkPreview } from '@/lib/calendar/mail-link-preview';
import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ wsId: string; eventId: string }>;
  }
) {
  await connection();
  const { wsId: rawWsId, eventId } = await params;
  const access = await authorizeCalendarEventManagement(request, rawWsId, {
    allowMailPreviewSession: true,
  });
  if ('error' in access) return access.error;
  if (!z.guid().safeParse(eventId).success)
    return NextResponse.json({}, { status: 404 });
  try {
    const preview = await getAuthorizedCalendarLinkPreview({
      ...access,
      eventId,
    });
    return NextResponse.json(preview ?? {}, {
      status: preview ? 200 : 404,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    // Never serialize provider errors or credentials, or distinguish inaccessible targets.
    return NextResponse.json(
      {},
      { status: 404, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
