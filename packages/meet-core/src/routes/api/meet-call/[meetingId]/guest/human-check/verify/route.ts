import { extractTurnstileRemoteIp } from '@tuturuuu/cloudflare/turnstile/server';
import {
  MAX_TRAJECTORY_POINTS,
  verifyJigsawAttempt,
} from '@tuturuuu/human-check';
import {
  chargeMeetHumanCheckPlacement,
  meetHumanCheckGuard,
  meetHumanCheckScope,
  meetHumanCheckSecret,
  meetHumanCheckStore,
} from '@tuturuuu/meet-core/features/call/server/guest-human-check';
import { MEET_GUEST_HUMAN_CHECK_ROUTE } from '@tuturuuu/meet-core/features/call/server/guest-unverified-risk';
import {
  buildAbuseRiskSubjects,
  recordAbuseActivitySignal,
} from '@tuturuuu/utils/abuse-protection/reputation';
import { z } from 'zod';

const headers = { 'Cache-Control': 'private, no-store' };
const coordinate = z.number().finite().min(-1000).max(1_000_000);

const bodySchema = z.object({
  token: z.string().min(1).max(4096),
  x: z.number().finite().min(-50).max(400),
  mode: z.enum(['pointer', 'keyboard']),
  trajectory: z
    .array(z.object({ t: coordinate, x: coordinate, y: coordinate }))
    .max(MAX_TRAJECTORY_POINTS),
});

/**
 * Checks one placement. A cross-meeting per-network placement budget is
 * charged first. A failed placement answers 200 with `ok: false` so the
 * client can try again; each puzzle allows three placements (two at the
 * harder level). Real passes and failures feed the abuse reputation.
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
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: 'Invalid attempt' },
      { status: 400, headers }
    );
  const secret = meetHumanCheckSecret();
  if (!secret)
    return Response.json(
      { error: 'Puzzle unavailable', code: 'MEET_HUMAN_CHECK_UNAVAILABLE' },
      { status: 503, headers }
    );
  const network = extractTurnstileRemoteIp(request);
  const guard = await meetHumanCheckGuard();
  const placement = await chargeMeetHumanCheckPlacement(network, guard);
  if (!placement.ok)
    return Response.json(
      { error: 'Too many attempts', code: 'MEET_GUEST_RATE_LIMITED' },
      {
        status: 429,
        headers: {
          ...headers,
          'Retry-After': String(placement.retryAfterSeconds),
        },
      }
    );
  const verdict = await verifyJigsawAttempt({
    secret,
    store: meetHumanCheckStore(guard),
    scope: meetHumanCheckScope(meetingId),
    subject: network ?? 'unknown',
    ...parsed.data,
  });
  const subjects = buildAbuseRiskSubjects({
    headers: request.headers,
    ipAddress: network ?? null,
  });
  // Only real placements on a live puzzle are recorded; forged, expired and
  // spent tokens cost no reputation write.
  const genuine =
    verdict.ok || verdict.reason === 'position' || verdict.reason === 'motion';
  if (genuine && subjects.length)
    await recordAbuseActivitySignal({
      ipAddress: network ?? null,
      method: 'POST',
      metadata: {
        meetingId,
        mode: parsed.data.mode,
        ...(verdict.ok ? {} : { reason: verdict.reason }),
      },
      reasonCode: verdict.ok
        ? 'meet_guest_human_check_passed'
        : 'meet_guest_human_check_failed',
      route: MEET_GUEST_HUMAN_CHECK_ROUTE,
      signalType: verdict.ok ? 'challenge_passed' : 'challenge_failed',
      subjects,
    }).catch(() => undefined);
  if (verdict.ok)
    return Response.json(
      { ok: true, passToken: verdict.passToken, expiresAt: verdict.expiresAt },
      { headers }
    );
  return Response.json({ ok: false, retry: verdict.retry }, { headers });
}
