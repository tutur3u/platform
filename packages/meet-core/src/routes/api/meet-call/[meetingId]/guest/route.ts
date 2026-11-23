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
  MEET_GUEST_COOKIE,
  MEET_GUEST_TTL_SECONDS,
  meetGuestCookieHeader,
  normalizeMeetGuestName,
  signMeetGuestSession,
  verifyMeetGuestSession,
} from '@tuturuuu/meet-core/features/call/lib/guest-session';
import { assessMeetGuestUnverifiedJoin } from '@tuturuuu/meet-core/features/call/server/guest-unverified-risk';
import { meetAiUsageGuard } from '@tuturuuu/meet-core/features/meeting-ai/server/usage-limit';
import { cookies } from 'next/headers';
import { z } from 'zod';

const headers = { 'Cache-Control': 'private, no-store' };

const bodySchema = z.object({
  displayName: z.string().max(400),
  turnstileToken: z.string().max(4096).optional(),
  /**
   * The Turnstile check could not load in this browser. The guest asks the
   * host directly: the session stays unverified, so it can only wait in the
   * lobby for a person to admit it.
   */
  hostApproval: z.literal(true).optional(),
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
  const limit = await checkMeetGuestJoinLimit(
    { meetingId, network: extractTurnstileRemoteIp(request) },
    await guestJoinLimiter()
  );
  if (!limit.ok)
    return Response.json(
      { error: 'Too many join attempts', code: 'MEET_GUEST_RATE_LIMITED' },
      {
        status: 429,
        headers: { ...headers, 'Retry-After': String(limit.retryAfterSeconds) },
      }
    );
  const state = await resolveMeetGuestJoin(meetingId);
  if (state.kind !== 'available')
    return Response.json(
      { error: 'Guest join is unavailable', code: 'MEET_GUEST_UNAVAILABLE' },
      { status: 403, headers }
    );
  const secret = getMeetRealtimeTokenSecret();
  const existing = await verifyMeetGuestSession(
    (await cookies()).get(MEET_GUEST_COOKIE)?.value,
    meetingId,
    secret
  );
  if (existing?.turnstileVerified)
    return Response.json({ ok: true }, { headers });
  const turnstileToken = parsed.data.turnstileToken?.trim();
  const devMode = process.env.NODE_ENV === 'development';
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
    return guestSessionResponse({
      guestId: existing?.guestId ?? crypto.randomUUID(),
      meetingId,
      displayName,
      secret,
      verified: false,
    });
  }
  try {
    await verifyTurnstileToken(request, turnstileToken, {
      devMode,
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
  return guestSessionResponse({
    guestId,
    meetingId,
    displayName,
    secret,
    verified,
  });
}

async function guestSessionResponse({
  guestId,
  meetingId,
  displayName,
  secret,
  verified,
}: {
  guestId: string;
  meetingId: string;
  displayName: string;
  secret: string;
  verified: boolean;
}) {
  const exp = Math.floor(Date.now() / 1000) + MEET_GUEST_TTL_SECONDS;
  const cookie = await signMeetGuestSession(
    {
      guestId,
      meetingId,
      displayName,
      exp,
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
