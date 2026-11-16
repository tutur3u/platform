import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { googleColorOperationModeEnabled } from '@/lib/calendar/google-color-operations/route-handlers';
import { resolveCalendarSource } from '@/lib/calendar/source-resolver';
import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';

const querySchema = z
  .object({
    provider: z.enum(['google', 'microsoft']),
    connectionId: z.guid(),
  })
  .strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const access = await authorizeCalendarEventManagement(
    request,
    (await params).wsId
  );
  if ('error' in access) return access.error;
  const search = new URL(request.url).searchParams;
  const query = querySchema.safeParse(Object.fromEntries(search));
  if (
    !query.success ||
    search.getAll('provider').length !== 1 ||
    search.getAll('connectionId').length !== 1
  )
    return NextResponse.json(
      { error: 'Invalid invitation source query' },
      { status: 400 }
    );
  try {
    const source = await resolveCalendarSource({
      ...access,
      source: query.data,
    });
    if (
      source.provider === 'tuturuuu' ||
      source.provider !== query.data.provider ||
      source.connectionId !== query.data.connectionId
    )
      return NextResponse.json(
        { error: 'Invitation source unavailable' },
        { status: 403 }
      );
    return NextResponse.json(
      {
        provider: source.provider,
        connectionId: source.connectionId,
        calendarId: source.externalCalendarId,
        invitationCreates: !googleColorOperationModeEnabled(),
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch {
    return NextResponse.json(
      { error: 'Invitation source unavailable' },
      { status: 403 }
    );
  }
}
