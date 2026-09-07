import {
  getMeetCallAccess,
  MeetCallAccessError,
} from '@/features/call/lib/call-access';
import { getMeetCallSession } from '@/features/call/lib/call-session';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  try {
    const { meetingId } = await params;
    const locale =
      (await cookies()).get(LOCALE_COOKIE_NAME)?.value === 'vi' ? 'vi' : 'en';
    const t = await getTranslations({ locale, namespace: 'meet.call' });
    const { user, meeting, isHost, admission, displayName } =
      await getMeetCallAccess(meetingId, t('guest'));
    return Response.json(
      await getMeetCallSession({
        displayName,
        isHost,
        admission,
        meetingId: meeting.id,
        userId: user.id,
        wsId: meeting.ws_id,
      }),
      { headers }
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof MeetCallAccessError
            ? error.message
            : 'Call token refresh failed',
      },
      {
        status: error instanceof MeetCallAccessError ? error.status : 500,
        headers,
      }
    );
  }
}

import { LOCALE_COOKIE_NAME } from '@tuturuuu/satellite/constants';
import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
