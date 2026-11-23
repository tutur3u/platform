import { extractTurnstileRemoteIp } from '@tuturuuu/cloudflare/turnstile/server';
import { createJigsawChallenge } from '@tuturuuu/human-check';
import { resolveMeetGuestJoin } from '@tuturuuu/meet-core/features/call/lib/guest-access';
import {
  chargeMeetHumanCheck,
  meetHumanCheckGuard,
  meetHumanCheckScope,
  meetHumanCheckSecret,
} from '@tuturuuu/meet-core/features/call/server/guest-human-check';
import { assessMeetGuestUnverifiedJoin } from '@tuturuuu/meet-core/features/call/server/guest-unverified-risk';
import { z } from 'zod';

const headers = { 'Cache-Control': 'private, no-store' };

/**
 * Issues a jigsaw puzzle for a guest whose Turnstile check cannot load.
 * Order: same-origin, configuration, the per-network and per-meeting puzzle
 * budget, the guest-join gates, then the adaptive abuse decision, so spam
 * is refused by the cheap counter before any database lookup.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  const { meetingId } = await params;
  if (!z.uuid().safeParse(meetingId).success)
    return Response.json(
      { error: 'Meeting not found' },
      { status: 404, headers }
    );
  const secret = meetHumanCheckSecret();
  if (!secret)
    return Response.json(
      { error: 'Puzzle unavailable', code: 'MEET_HUMAN_CHECK_UNAVAILABLE' },
      { status: 503, headers }
    );
  const network = extractTurnstileRemoteIp(request);
  const charge = await chargeMeetHumanCheck(
    { meetingId, network },
    await meetHumanCheckGuard()
  );
  if (!charge.ok)
    return Response.json(
      { error: 'Too many puzzles', code: 'MEET_GUEST_RATE_LIMITED' },
      {
        status: 429,
        headers: {
          ...headers,
          'Retry-After': String(charge.retryAfterSeconds),
        },
      }
    );
  if ((await resolveMeetGuestJoin(meetingId)).kind !== 'available')
    return Response.json(
      { error: 'Guest join is unavailable', code: 'MEET_GUEST_UNAVAILABLE' },
      { status: 403, headers }
    );
  const risk = await assessMeetGuestUnverifiedJoin(request, {
    meetingId,
    network,
    kind: 'human-check',
  });
  if (!risk.allowed)
    return Response.json(
      {
        error: 'Verification required',
        code: 'MEET_GUEST_VERIFICATION_REQUIRED',
      },
      { status: 403, headers }
    );
  const challenge = await createJigsawChallenge({
    secret,
    scope: meetHumanCheckScope(meetingId),
    subject: network ?? 'unknown',
    level: charge.level,
  });
  return Response.json(challenge, { headers });
}
