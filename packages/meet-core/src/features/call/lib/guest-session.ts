/**
 * Signed, meeting-bound identity for anonymous Meet guests.
 *
 * A guest has no Tuturuuu account, so the server mints a participant id
 * after a Turnstile check and stores it with the chosen display name in an
 * HttpOnly cookie. The HMAC key is derived from the realtime token secret with
 * a purpose label, so a guest cookie can never be replayed as a realtime token.
 */

export const MEET_GUEST_COOKIE = '__Host-meet-guest';
/** A guest stays recognised for one long class or workshop, never longer. */
export const MEET_GUEST_TTL_SECONDS = 12 * 60 * 60;
export const MEET_GUEST_NAME_MAX = 60;

export type MeetGuestSession = {
  guestId: string;
  turnstileVerified?: true;
  meetingId: string;
  displayName: string;
  /** Expiry in Unix seconds. */
  exp: number;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function fromBase64Url(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function guestKey(secret: string) {
  const root = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const derived = await crypto.subtle.sign(
    'HMAC',
    root,
    encoder.encode('meet-guest-cookie:v1')
  );
  return crypto.subtle.importKey(
    'raw',
    derived,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Keeps letters, numbers, spaces and common name punctuation; collapses
 * whitespace and strips control and bidi-override characters.
 */
export function normalizeMeetGuestName(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, MEET_GUEST_NAME_MAX)
    .trim();
}

export async function signMeetGuestSession(
  session: MeetGuestSession,
  secret: string
) {
  const body = toBase64Url(
    encoder.encode(
      JSON.stringify({
        v: 1,
        g: session.guestId,
        m: session.meetingId,
        n: session.displayName,
        e: session.exp,
        ...(session.turnstileVerified ? { t: true } : {}),
      })
    )
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    await guestKey(secret),
    encoder.encode(body)
  );
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/** Returns the session only for this meeting, unexpired and correctly signed. */
export async function verifyMeetGuestSession(
  value: string | undefined | null,
  meetingId: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<MeetGuestSession | null> {
  if (!value || value.length > 1024) return null;
  const [body, signature, extra] = value.split('.');
  if (!body || !signature || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await guestKey(secret),
      fromBase64Url(signature),
      encoder.encode(body)
    );
    if (!valid) return null;
    const parsed = JSON.parse(
      new TextDecoder().decode(fromBase64Url(body))
    ) as {
      v?: unknown;
      g?: unknown;
      m?: unknown;
      n?: unknown;
      e?: unknown;
      t?: unknown;
    };
    const displayName = normalizeMeetGuestName(parsed.n);
    if (
      parsed.v !== 1 ||
      typeof parsed.g !== 'string' ||
      !UUID.test(parsed.g) ||
      parsed.m !== meetingId ||
      !displayName ||
      typeof parsed.e !== 'number' ||
      !Number.isSafeInteger(parsed.e) ||
      parsed.e <= nowSeconds ||
      parsed.e > nowSeconds + MEET_GUEST_TTL_SECONDS
    )
      return null;
    return {
      guestId: parsed.g,
      meetingId,
      displayName,
      exp: parsed.e,
      ...(parsed.t === true ? { turnstileVerified: true } : {}),
    };
  } catch {
    return null;
  }
}

/** HttpOnly, host-only and same-site: scripts and other sites never see it. */
export function meetGuestCookieHeader(value: string, maxAgeSeconds: number) {
  return [
    `${MEET_GUEST_COOKIE}=${value}`,
    'Path=/',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ].join('; ');
}
