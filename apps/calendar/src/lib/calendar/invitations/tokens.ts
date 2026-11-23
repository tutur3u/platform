import { createHash, randomBytes } from 'node:crypto';

export type InviteTokenPurpose = 'rsvp' | 'unsubscribe';

/** RSVP links outlive the event by a little; unsubscribe links last a year. */
export const INVITE_TOKEN_TTL_MS: Record<InviteTokenPurpose, number> = {
  rsvp: 60 * 24 * 60 * 60 * 1000,
  unsubscribe: 365 * 24 * 60 * 60 * 1000,
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** 256-bit random token; only its SHA-256 is stored. */
export function createInviteToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashInviteToken(token) };
}

export function isWellFormedInviteToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

export function inviteTokenExpiry(
  purpose: InviteTokenPurpose,
  eventEnd: Date,
  now = new Date()
): Date {
  const ttl = INVITE_TOKEN_TTL_MS[purpose];
  if (purpose === 'unsubscribe') return new Date(now.getTime() + ttl);
  // An RSVP link stays useful until a week after the event, capped at the TTL.
  const afterEvent = eventEnd.getTime() + 7 * 24 * 60 * 60 * 1000;
  return new Date(
    Math.min(
      now.getTime() + ttl,
      Math.max(afterEvent, now.getTime() + 24 * 60 * 60 * 1000)
    )
  );
}
