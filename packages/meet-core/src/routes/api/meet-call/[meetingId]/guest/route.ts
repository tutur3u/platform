import {
  extractTurnstileRemoteIp,
  verifyTurnstileToken,
} from '@tuturuuu/cloudflare/turnstile/server';
import {
  getMeetRealtimeTokenSecret,
  meetDeviceIdentity,
} from '@tuturuuu/meet-core/features/call/lib/call-session';
import { resolveMeetGuestJoin } from '@tuturuuu/meet-core/features/call/lib/guest-access';
import { checkMeetGuestJoinLimit } from '@tuturuuu/meet-core/features/call/lib/guest-rate-limit';
import { checkMeetGuestUnverifiedLimit } from '@tuturuuu/meet-core/features/call/lib/guest-unverified-limit';
import {
  meetHumanCheckGuard,
  meetHumanCheckScope,
  meetHumanCheckSecret,
  meetHumanCheckStore,
} from '@tuturuuu/meet-core/features/call/server/guest-human-check';
import {
  MEET_GUEST_COOKIE,
  MEET_GUEST_TTL_SECONDS,
  meetGuestCookieHeader,
  normalizeMeetGuestName,
  signMeetGuestSession,
  verifyMeetGuestSession,
} from '@tuturuuu/meet-core/features/call/lib/guest-session';
import { assessMeetGuestUnverifiedJoin } from '@tuturuuu/meet-core/features/call/server/guest-unverified-risk';
import { meetAiUsageGuard } from '@tuturuuu/meet-core/features/meeting-ai/server/usage-limit';
import { MEET_EVENT_GUEST_LIMIT } from '@tuturuuu/realtime/meet';
import { redeemPassToken } from '@tuturuuu/human-check';
import {
  issueMeetGuestWork,
  redeemMeetGuestWork,
} from '../../../../../features/call/server/guest-event-challenge';
import { meetEventClientIp } from '../../../../../features/call/server/guest-event-network';
import { networkSubject } from '@tuturuuu/utils/network-subject';
import { cookies } from 'next/headers';
import { z } from 'zod';

const headers = { 'Cache-Control': 'private, no-store' };

const bodySchema = z.object({
  displayName: z.string().max(400),
  turnstileToken: z.string().max(4096).optional(),
  /** Single-use pass from the Tuturuuu jigsaw check when Turnstile cannot load. */
  humanPassToken: z.string().max(2048).optional(),
  /**
   * The Turnstile check could not load in this browser. The guest asks the
   * host directly: the session stays unverified, so it can only wait in the
   * lobby for a person to admit it.
   */
  hostApproval: z.literal(true).optional(),
  beginEventWork: z.literal(true).optional(),
  eventWork: z
    .object({
      ticket: z.string().min(1).max(2048),
      nonce: z.number().int().min(0).max(0xffffffff),
    })
    .optional(),
});

async function guestJoinLimiter() {
  try {
    const { selection } = await meetAiUsageGuard();
    return selection.kind === 'durable-object' ? selection.client : null;
  } catch {
    return null;
  }
}

/**
 * Anonymous guest join. Order matters: same-origin check, input validation,
 * the per-network attempt limit (failed checks count), the guest-join gates,
 * then Turnstile for a new guest session. Guests wait in the lobby for
 * approval even when the room skips the lobby for signed-in participants.
 *
 * A tokenless `hostApproval` request skips Turnstile only after the adaptive
 * abuse decision admits it and its own tighter network and room limits
 * pass. Its session is never marked verified, so the realtime room holds it
 * in the lobby, flagged unverified for the host.
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
  const displayName = normalizeMeetGuestName(parsed.data?.displayName);
  if (!parsed.success || !displayName)
    return Response.json(
      { error: 'Enter a display name', code: 'MEET_GUEST_NAME_REQUIRED' },
      { status: 400, headers }
    );
  const { beginEventWork, eventWork, hostApproval } = parsed.data;
  if (
    (eventWork || beginEventWork) &&
    ((eventWork && beginEventWork) ||
      hostApproval ||
      parsed.data.turnstileToken ||
      parsed.data.humanPassToken)
  )
    return Response.json(
      { error: 'Invalid verification' },
      { status: 400, headers }
    );
  const legacyNetwork = extractTurnstileRemoteIp(request);
  const trustedNetwork = meetEventClientIp(request.headers);
  const limiter = await guestJoinLimiter();
  const limit = await checkMeetGuestJoinLimit(
    { meetingId, network: legacyNetwork },
    limiter
  );
  if (!limit.ok)
    return Response.json(
      { error: 'Too many join attempts', code: 'MEET_GUEST_RATE_LIMITED' },
      {
        status: 429,
        headers: {
          ...headers,
          'Retry-After': String(limit.retryAfterSeconds),
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
  const network = event ? trustedNetwork : legacyNetwork;
  if (event && !network)
    return Response.json(
      {
        error: 'Verification required',
        code: 'MEET_GUEST_VERIFICATION_REQUIRED',
      },
      { status: 403, headers }
    );
  const requestWork =
    beginEventWork ||
    (hostApproval &&
      !parsed.data.turnstileToken &&
      !parsed.data.humanPassToken);
  let manualProof: number | undefined;
  let difficulty: 19 | 20 | 22 = 19;
  if (event) {
    const trustedBudget =
      network === legacyNetwork
        ? limit
        : await checkMeetGuestJoinLimit(
            { meetingId, network, requireSharedStore: true },
            limiter
          );
    if (!trustedBudget.ok)
      return Response.json(
        { error: 'Too many join attempts', code: 'MEET_GUEST_RATE_LIMITED' },
        {
          status: 429,
          headers: {
            ...headers,
            'Retry-After': String(trustedBudget.retryAfterSeconds),
          },
        }
      );
    const eventLimit = await checkMeetGuestJoinLimit(
      {
        meetingId,
        network,
        eventLimit: MEET_EVENT_GUEST_LIMIT,
        phase: requestWork ? 'challenge' : eventWork ? 'work' : 'verify',
        requireSharedStore: true,
      },
      limiter
    );
    if (!eventLimit.ok)
      return Response.json(
        { error: 'Too many join attempts', code: 'MEET_GUEST_RATE_LIMITED' },
        {
          status: 429,
          headers: {
            ...headers,
            'Retry-After': String(eventLimit.retryAfterSeconds),
          },
        }
      );
    const risk = await assessMeetGuestUnverifiedJoin(request, {
      meetingId,
      network,
      event: true,
    });
    if (!risk.allowed || !risk.decision)
      return Response.json(
        {
          error: 'Verification required',
          code: 'MEET_GUEST_VERIFICATION_REQUIRED',
        },
        { status: 403, headers }
      );
    if (risk.decision.tier === 'challenge_required') {
      manualProof = event;
      difficulty = 22;
    } else if (risk.decision.tier === 'watch') {
      difficulty = 20;
    }
  }
  const tokenSecret = getMeetRealtimeTokenSecret();
  const existing = await verifyMeetGuestSession(
    (await cookies()).get(MEET_GUEST_COOKIE)?.value,
    meetingId,
    tokenSecret
  );
  if (
    !eventWork &&
    ((!manualProof && existing?.turnstileVerified) ||
      (event && existing?.eventProof === event))
  )
    return Response.json({ ok: true }, { headers });
  const respondWithSession = async (
    session: Parameters<typeof guestSessionResponse>[0]
  ) => {
    if (event && Date.now() >= event)
      return Response.json(
        { error: 'Event expired', code: 'MEET_GUEST_VERIFICATION_REQUIRED' },
        { status: 403, headers }
      );
    if (event) {
      const budget = await checkMeetGuestJoinLimit(
        {
          meetingId,
          network,
          eventLimit: MEET_EVENT_GUEST_LIMIT,
          requireSharedStore: true,
        },
        limiter
      );
      if (!budget.ok)
        return Response.json(
          { error: 'Too many join attempts', code: 'MEET_GUEST_RATE_LIMITED' },
          {
            status: 429,
            headers: {
              ...headers,
              'Retry-After': String(budget.retryAfterSeconds),
            },
          }
        );
    }
    if (event && Date.now() >= event)
      return Response.json(
        { error: 'Event expired', code: 'MEET_GUEST_VERIFICATION_REQUIRED' },
        { status: 403, headers }
      );
    return guestSessionResponse(session);
  };
  if (eventWork || beginEventWork || (event && requestWork)) {
    if (event) {
      const context = {
        meetingId,
        eventExpiresAt: event,
        network,
        displayName,
      };
      if (!eventWork)
        return Response.json(
          { challenge: issueMeetGuestWork(context, difficulty, tokenSecret) },
          { headers }
        );
      const guard = await meetHumanCheckGuard();
      if (guard) {
        const redeemed = await redeemMeetGuestWork(
          context,
          eventWork,
          tokenSecret,
          async (id, ttlMs) =>
            (
              await guard.incr(
                `meet-event-work:${id}`,
                1,
                Math.max(1_000, ttlMs)
              )
            ).n === 1,
          Date.now,
          difficulty
        ).catch(() => null);
        if (redeemed)
          return respondWithSession({
            guestId:
              existing?.guestId ??
              (await meetDeviceIdentity(
                meetingId,
                `guest-event-work:${redeemed}`
              )),
            meetingId,
            displayName,
            secret: tokenSecret,
            verified: false,
            eventProof: event,
          });
      }
    }
    return Response.json(
      { error: 'Verification failed', code: 'MEET_GUEST_TURNSTILE_FAILED' },
      { status: 403, headers }
    );
  }
  const turnstileToken = parsed.data.turnstileToken?.trim();
  const devMode = process.env.NODE_ENV === 'development';
  const humanPassToken = parsed.data.humanPassToken?.trim();
  if (!turnstileToken && humanPassToken) {
    const secret = meetHumanCheckSecret();
    const pass = secret
      ? await redeemPassToken({
          secret,
          store: meetHumanCheckStore(
            await meetHumanCheckGuard(),
            Boolean(event)
          ),
          token: humanPassToken,
          scope: meetHumanCheckScope(meetingId, event),
          subject:
            event && network ? networkSubject(network) : (network ?? 'unknown'),
        }).catch(() => ({ ok: false }) as const)
      : ({ ok: false } as const);
    if (!pass.ok)
      return Response.json(
        { error: 'Verification failed', code: 'MEET_GUEST_TURNSTILE_FAILED' },
        { status: 403, headers }
      );
    return respondWithSession({
      guestId:
        existing?.guestId ??
        (await meetDeviceIdentity(meetingId, `guest-human:${pass.jti}`)),
      meetingId,
      displayName,
      secret: tokenSecret,
      verified: !manualProof,
      eventProof: manualProof,
    });
  }
  if (event && (!turnstileToken || devMode))
    return Response.json(
      {
        error: 'Verification required',
        code: 'MEET_GUEST_VERIFICATION_REQUIRED',
      },
      { status: 403, headers }
    );
  if (!turnstileToken && parsed.data.hostApproval === true) {
    const network = extractTurnstileRemoteIp(request);
    const risk = await assessMeetGuestUnverifiedJoin(request, {
      meetingId,
      network,
    });
    if (!risk.allowed)
      return Response.json(
        {
          error: 'Verification required',
          code: 'MEET_GUEST_VERIFICATION_REQUIRED',
        },
        { status: 403, headers }
      );
    const unverifiedLimit = await checkMeetGuestUnverifiedLimit(
      { meetingId, network, networkLimit: risk.networkLimit },
      await guestJoinLimiter()
    );
    if (!unverifiedLimit.ok)
      return Response.json(
        { error: 'Too many join attempts', code: 'MEET_GUEST_RATE_LIMITED' },
        {
          status: 429,
          headers: {
            ...headers,
            'Retry-After': String(unverifiedLimit.retryAfterSeconds),
          },
        }
      );
    return respondWithSession({
      guestId: existing?.guestId ?? crypto.randomUUID(),
      meetingId,
      displayName,
      secret: tokenSecret,
      verified: false,
    });
  }
  try {
    await verifyTurnstileToken(request, turnstileToken, {
      devMode,
      ...(event ? { remoteIp: network } : {}),
      expectedHostname: new URL(request.url).hostname,
    });
  } catch {
    return Response.json(
      { error: 'Verification failed', code: 'MEET_GUEST_TURNSTILE_FAILED' },
      { status: 403, headers }
    );
  }
  const verified = !devMode && !!turnstileToken;
  const guestId =
    existing?.guestId ??
    (verified
      ? await meetDeviceIdentity(meetingId, `guest-turnstile:${turnstileToken}`)
      : crypto.randomUUID());
  return respondWithSession({
    guestId,
    meetingId,
    displayName,
    secret: tokenSecret,
    verified: verified && !manualProof,
    eventProof: verified ? manualProof : undefined,
  });
}

async function guestSessionResponse({
  guestId,
  meetingId,
  displayName,
  secret,
  verified,
  eventProof,
}: {
  guestId: string;
  meetingId: string;
  displayName: string;
  secret: string;
  verified: boolean;
  eventProof?: number;
}) {
  const exp = Math.floor(Date.now() / 1000) + MEET_GUEST_TTL_SECONDS;
  const cookie = await signMeetGuestSession(
    {
      guestId,
      meetingId,
      displayName,
      exp,
      ...(eventProof ? { eventProof } : {}),
      ...(verified ? { turnstileVerified: true } : {}),
    },
    secret
  );
  return Response.json(
    { ok: true },
    {
      headers: {
        ...headers,
        'Set-Cookie': meetGuestCookieHeader(cookie, MEET_GUEST_TTL_SECONDS),
      },
    }
  );
}

/** Leaving as a guest forgets the guest identity on this browser. */
export async function DELETE(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  return Response.json(
    { ok: true },
    { headers: { ...headers, 'Set-Cookie': meetGuestCookieHeader('', 0) } }
  );
}
