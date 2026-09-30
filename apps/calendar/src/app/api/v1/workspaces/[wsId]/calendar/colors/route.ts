import { google } from '@tuturuuu/google';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  GoogleColorChoiceError,
  loadGoogleColorOptions,
} from '@/lib/calendar/google-color-choices';
import { refreshOwnedGoogleSourceColor } from '@/lib/calendar/google-source-color-refresh';
import { createGoogleAuthClient } from '@/lib/calendar/provider-writes';
import { resolveCalendarSource } from '@/lib/calendar/source-resolver';
import { authorizeCalendarEventManagement } from '@/lib/calendar-event-permission';

const querySchema = z.object({ connectionId: z.guid() }).strict();
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
  if (new URL(request.url).searchParams.getAll('connectionId').length !== 1)
    return NextResponse.json(
      { error: 'Exactly one color source is required' },
      { status: 400 }
    );
  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!query.success)
    return NextResponse.json(
      { error: 'Invalid color source query' },
      { status: 400 }
    );
  try {
    // Resolver binds the source to this actor's active account and writable connection.
    const source = await resolveCalendarSource({
      ...access,
      source: { provider: 'google', connectionId: query.data.connectionId },
    });
    const calendar = google.calendar({
      version: 'v3',
      auth: createGoogleAuthClient(source),
    });
    const { options } = await loadGoogleColorOptions(calendar, source);
    await refreshOwnedGoogleSourceColor({
      ...access,
      source,
      background: options.sourceColor.background,
    });
    return NextResponse.json(options, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const sourceUnavailable =
      error instanceof Error &&
      error.message.includes('unavailable or read-only');
    return NextResponse.json(
      {
        error:
          error instanceof GoogleColorChoiceError
            ? error.message
            : 'Calendar color options are unavailable',
      },
      {
        status:
          error instanceof GoogleColorChoiceError
            ? error.status
            : sourceUnavailable
              ? 403
              : 502,
      }
    );
  }
}
