import {
  extractTurnstileRemoteIp,
  verifyTurnstileToken,
} from '@tuturuuu/cloudflare/turnstile/server';
import { getMeetRealtimeTokenSecret } from '@tuturuuu/meet-core/features/call/lib/call-session';
import { resolveMeetGuestJoin } from '@tuturuuu/meet-core/features/call/lib/guest-access';
import { checkMeetGuestJoinLimit } from '@tuturuuu/meet-core/features/call/lib/guest-rate-limit';
import {
  MEET_GUEST_TTL_SECONDS,
  meetGuestCookieHeader,
  normalizeMeetGuestName,
  signMeetGuestSession,
} from '@tuturuuu/meet-core/features/call/lib/guest-session';
import { meetAiUsageGuard } from '@tuturuuu/meet-core/features/meeting-ai/server/usage-limit';
import { z } from 'zod';

const headers = { 'Cache-Control': 'private, no-store' };

const bodySchema = z.object({
  displayName: z.string().max(400),
  turnstileToken: z.string().max(4096).optional(),
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
 * then Turnstile. Only then does the server mint a random guest id and set
 * the signed cookie; the guest still waits in the lobby unless the host
 * admits everyone automatically.
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
  try {
    await verifyTurnstileToken(request, parsed.data.turnstileToken, {
      expectedHostname: new URL(request.url).hostname,
    });
  } catch {
    return Response.json(
      { error: 'Verification failed', code: 'MEET_GUEST_TURNSTILE_FAILED' },
      { status: 403, headers }
    );
  }
  const exp = Math.floor(Date.now() / 1000) + MEET_GUEST_TTL_SECONDS;
  const cookie = await signMeetGuestSession(
    { guestId: crypto.randomUUID(), meetingId, displayName, exp },
    getMeetRealtimeTokenSecret()
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
