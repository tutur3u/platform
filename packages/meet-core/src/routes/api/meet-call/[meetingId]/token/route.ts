import { extractTurnstileRemoteIp } from '@tuturuuu/cloudflare/turnstile/server';
import { assessMeetGuestUnverifiedJoin } from '@tuturuuu/meet-core/features/call/server/guest-unverified-risk';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { MEETING_APP } from '@tuturuuu/meet-core/runtime';
import { isVerifiedTuturuuuStaffSession } from '@tuturuuu/utils/email/staff-session';
import {
  getMeetCallAccess,
  MeetCallAccessError,
} from '@tuturuuu/meet-core/features/call/lib/call-access';
import { getMeetCallSession } from '@tuturuuu/meet-core/features/call/lib/call-session';
import { resolveMeetClassRole } from '@tuturuuu/meet-core/features/call/server/class-role';
import { getMeetGuestCallAccess } from '@tuturuuu/meet-core/features/call/lib/guest-access';
import { MEET_GUEST_COOKIE } from '@tuturuuu/meet-core/features/call/lib/guest-session';
import {
  getHostMeetingDurationSeconds,
  getParticipantStreamTier,
} from '@tuturuuu/meet-core/features/call/lib/meeting-duration';
import { z } from 'zod';

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
    const cookieStore = await cookies();
    const resolved = await getMeetCallAccess(meetingId, t('guest'))
      .then((access) => ({ ...access, guest: false as const }))
      .catch(async (error: unknown) => {
        if (!(error instanceof MeetCallAccessError) || error.status !== 401)
          throw error;
        const access = await getMeetGuestCallAccess(
          meetingId,
          cookieStore.get(MEET_GUEST_COOKIE)?.value
        );
        if (!access) throw error;
        return access;
      });
    const { user, meeting, isHost, admission, displayName, avatarUrl, guest } =
      resolved;
    if (resolved.guest && resolved.eventExpiresAt) {
      const risk = await assessMeetGuestUnverifiedJoin(request, {
        meetingId,
        network: extractTurnstileRemoteIp(request),
        event: true,
      });
      if (
        !risk.allowed ||
        !risk.decision ||
        (risk.decision.tier === 'challenge_required' &&
          resolved.eventProof !== resolved.eventExpiresAt)
      )
        return Response.json(
          {
            error: 'Verification required',
            code: 'MEET_GUEST_VERIFICATION_REQUIRED',
          },
          { status: 403, headers }
        );
    }
    const classRole = await resolveMeetClassRole(resolved);
    // Both plan lookups run together; the participant's is bounded.
    const [maxRoomDurationSeconds, streamTier] = await Promise.all([
      getHostMeetingDurationSeconds(meeting.creator_id),
      guest ? ('free' as const) : getParticipantStreamTier(user.id),
    ]);
    const eventHost =
      !resolved.guest &&
      isHost &&
      MEETING_APP === 'meet' &&
      'email' in resolved.user &&
      typeof resolved.user.email === 'string' &&
      resolved.user.email.endsWith('@tuturuuu.com')
        ? await (async () => {
            const admin = await createAdminClient({ noCookie: true });
            const { data, error } = await admin.auth.admin.getUserById(user.id);
            return (
              !error &&
              data.user?.id === user.id &&
              isVerifiedTuturuuuStaffSession(data.user)
            );
          })().catch(() => false)
        : false;
    const session = await getMeetCallSession({
      guest,
      ...(eventHost ? { eventHost: true as const } : {}),
      ...(resolved.guest ? { guestEventProof: resolved.eventProof } : {}),
      // A guest verified by Turnstile or the human check carries it into the
      // realtime token, so the host's lobby shows no Unverified badge.
      ...(guest && 'turnstileVerified' in resolved && resolved.turnstileVerified
        ? { guestTurnstileVerified: true as const }
        : {}),
      coHost: classRole.coHost,
      participantKind: classRole.participantKind,
      maxRoomDurationSeconds,
      deviceId,
      displayName,
      avatarUrl,
      isHost,
      admission,
      meetingId: meeting.id,
      streamTier,
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
      }).catch((error: unknown) => {
        console.warn('Meet device connection check unavailable', {
          kind: error instanceof Error ? error.name : 'unknown',
        });
        return null;
      });
      if (!result?.ok) {
        console.warn('Meet device connection check failed', {
          status: result?.status,
        });
        return Response.json(
          {
            error: 'Meeting connection unavailable',
            code: 'MEET_REALTIME_UNAVAILABLE',
          },
          { status: 503, headers: { ...headers, 'Retry-After': '2' } }
        );
      }
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
