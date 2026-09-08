import { z } from 'zod';
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
    const parsed = z
      .object({
        deviceId: z.uuid().optional(),
        joinMode: z.enum(['switch', 'additional']).optional(),
      })
      .safeParse(await request.json().catch(() => ({})));
    if (!parsed.success)
      return Response.json(
        { error: 'Invalid device session' },
        { status: 400, headers }
      );
    const { deviceId, joinMode } = parsed.data;
    const locale =
      (await cookies()).get(LOCALE_COOKIE_NAME)?.value === 'vi' ? 'vi' : 'en';
    const t = await getTranslations({ locale, namespace: 'meet.call' });
    const { user, meeting, isHost, admission, displayName, avatarUrl } =
      await getMeetCallAccess(meetingId, t('guest'));
    const session = await getMeetCallSession({
      deviceId,
      displayName,
      avatarUrl,
      isHost,
      admission,
      meetingId: meeting.id,
      userId: user.id,
      wsId: meeting.ws_id,
    });
    if (deviceId && joinMode !== 'additional') {
      const endpoint = new URL(session.realtimeUrl);
      endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
      endpoint.pathname = '/room-device';
      endpoint.search = '';
      const result = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: joinMode }),
        signal: AbortSignal.timeout(5000),
      });
      if (!result.ok) throw new Error('Device check failed');
      const policy = (await result.json()) as { otherDeviceCount: number };
      if (!joinMode && policy.otherDeviceCount)
        return Response.json(
          {
            requiresDeviceChoice: true,
            otherDeviceCount: policy.otherDeviceCount,
          },
          { headers }
        );
    }
    return Response.json(
      { ...session, requiresDeviceChoice: false },
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
