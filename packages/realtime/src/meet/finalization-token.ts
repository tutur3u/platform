import { z } from 'zod';
import { signRealtimePayload, verifyRealtimePayload } from '../core/token';
import {
  MEET_FINALIZE_MAX_ACCOUNTS,
  type MeetFinalization,
  type MeetFinalizeDelivery,
} from './finalization';

// Node crypto lives here, apart from the pure ledger, so the browser bundle of
// the room protocol never pulls it in.
export const MEET_FINALIZE_TOKEN_TTL_MS = 10 * 60_000;
export const MEET_FINALIZE_REQUEST_TIMEOUT_MS = 20_000;

const uuid = z.uuid();
export const meetFinalizeTokenSchema = z.object({
  aud: z.literal('meet-finalize'),
  exp: z.number().int().positive(),
  sessionId: uuid,
  meetingId: uuid,
  wsId: uuid,
  consented: z.array(uuid).min(1).max(MEET_FINALIZE_MAX_ACCOUNTS),
  readers: z.array(uuid).max(MEET_FINALIZE_MAX_ACCOUNTS),
});
export type MeetFinalizeClaims = z.infer<typeof meetFinalizeTokenSchema>;

// Domain separation: a room join token can never validate as a finalize token.
const finalizeSecret = (secret: string) => `${secret.trim()}:meet-finalize`;

export function signMeetFinalizeToken(
  record: MeetFinalization,
  secret: string,
  now: number
) {
  return signRealtimePayload(
    meetFinalizeTokenSchema.parse({
      aud: 'meet-finalize',
      exp: Math.floor((now + MEET_FINALIZE_TOKEN_TTL_MS) / 1000),
      sessionId: record.sessionId,
      meetingId: record.meetingId,
      wsId: record.wsId,
      consented: record.consentedAccountIds,
      readers: record.readerAccountIds,
    }),
    finalizeSecret(secret)
  );
}

export function verifyMeetFinalizeToken(
  token: string,
  secret: string,
  now = Date.now()
): MeetFinalizeClaims | null {
  try {
    const parsed = meetFinalizeTokenSchema.safeParse(
      verifyRealtimePayload(token, finalizeSecret(secret))
    );
    return parsed.success && parsed.data.exp * 1000 > now ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The request carries identifiers and consent only: never transcript or notes. */
export async function deliverMeetFinalization(
  record: MeetFinalization,
  options: {
    url: string;
    secret: string;
    now: number;
    fetch?: typeof fetch;
  }
): Promise<MeetFinalizeDelivery> {
  let response: Response;
  try {
    response = await (options.fetch ?? fetch)(options.url, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${signMeetFinalizeToken(record, options.secret, options.now)}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(MEET_FINALIZE_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return 'retry';
  }
  // Unauthorized means the secrets disagree; retrying cannot help.
  if (response.status === 401 || response.status === 403) return 'fatal';
  if (response.status === 404 || response.status === 429) return 'retry';
  if (response.status >= 500) return 'retry';
  if (!response.ok) return 'fatal';
  const body = (await response.json().catch(() => null)) as {
    status?: unknown;
  } | null;
  return body?.status === 'pending' ? 'retry' : 'done';
}
