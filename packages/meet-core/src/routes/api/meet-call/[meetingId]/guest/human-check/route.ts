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
import { meetEventClientIp } from '../../../../../../features/call/server/guest-event-network';
import { networkSubject } from '@tuturuuu/utils/network-subject';
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
  const legacyNetwork = extractTurnstileRemoteIp(request);
  const guard = await meetHumanCheckGuard();
  const charge = await chargeMeetHumanCheck(
    { meetingId, network: legacyNetwork },
    guard
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
  const state = await resolveMeetGuestJoin(meetingId);
  if (state.kind !== 'available')
    return Response.json(
      { error: 'Guest join is unavailable', code: 'MEET_GUEST_UNAVAILABLE' },
      { status: 403, headers }
    );
  const event = state.eventExpiresAt;
  const ip = event ? meetEventClientIp(request.headers) : legacyNetwork;
  const network = event && ip ? networkSubject(ip) : ip;
  const risk = await assessMeetGuestUnverifiedJoin(request, {
    meetingId,
    network: ip,
    kind: 'human-check',
    ...(state.eventExpiresAt ? { event: true } : {}),
  });
  if (!risk.allowed || (event && !risk.decision))
    return Response.json(
      {
        error: 'Verification required',
        code: 'MEET_GUEST_VERIFICATION_REQUIRED',
      },
      { status: 403, headers }
    );
  const eventCharge = event
    ? await chargeMeetHumanCheck({ meetingId, network, event: true }, guard)
    : charge;
  if (!eventCharge.ok)
    return Response.json(
      { error: 'Too many puzzles', code: 'MEET_GUEST_RATE_LIMITED' },
      {
        status: 429,
        headers: {
          ...headers,
          'Retry-After': String(eventCharge.retryAfterSeconds),
        },
      }
    );
  const challenge = await createJigsawChallenge({
    secret,
    scope: meetHumanCheckScope(meetingId, event),
    subject: network ?? 'unknown',
    level: eventCharge.level,
  });
  return Response.json(challenge, { headers });
}
