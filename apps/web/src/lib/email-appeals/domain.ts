import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';

export const APPEAL_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const appealReasonSchema = z.enum([
  'hard_bounce',
  'soft_bounce_threshold',
  'spam_complaint',
  'manual',
]);
export type AppealReason = z.infer<typeof appealReasonSchema>;
export const storedAppealReasonSchema = z
  .string()
  .transform((value): AppealReason => {
    if (value === 'ses_hard_bounce') return 'hard_bounce';
    if (value === 'ses_soft_bounce_threshold') return 'soft_bounce_threshold';
    if (value === 'ses_complaint') return 'spam_complaint';
    return 'manual';
  });
export type AppealErrorCode =
  | 'invalid_request'
  | 'invalid_token'
  | 'expired_token'
  | 'forbidden'
  | 'flag_disabled'
  | 'rate_limited'
  | 'cooldown'
  | 'not_appealable'
  | 'deliverability_failed'
  | 'transport_unavailable'
  | 'store_unavailable';

export class AppealError extends Error {
  constructor(readonly code: AppealErrorCode) {
    super(code);
  }
}

export const appealTokenBindingSchema = z
  .object({
    appealId: z.uuid(),
    wsId: z.uuid(),
    recipientHash: z.string().regex(/^[a-f0-9]{64}$/),
    purpose: z.literal('workspace_report_reenable'),
    generation: z.string().min(1).max(128),
    expiresAt: z.number().int().positive(),
  })
  .strict();
export type AppealTokenBinding = z.infer<typeof appealTokenBindingSchema>;
const claimsSchema = appealTokenBindingSchema.extend({
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

function signingKey(key: string): string {
  if (Buffer.byteLength(key) < 32)
    throw new AppealError('transport_unavailable');
  return key;
}

export function issueAppealToken(
  binding: AppealTokenBinding,
  key: string,
  now = Date.now()
) {
  const claims = claimsSchema.parse({
    ...binding,
    nonce: randomBytes(32).toString('base64url'),
  });
  if (claims.expiresAt <= now || claims.expiresAt > now + APPEAL_LIFETIME_MS) {
    throw new AppealError('expired_token');
  }
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', signingKey(key))
    .update(body)
    .digest('base64url');
  return `${body}.${signature}`;
}

export function verifyAppealToken(
  token: string,
  key: string,
  now = Date.now()
) {
  if (
    token.length > 1024 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token)
  ) {
    throw new AppealError('invalid_token');
  }
  const [body, signature] = token.split('.');
  if (!body || !signature) throw new AppealError('invalid_token');
  const expected = createHmac('sha256', signingKey(key)).update(body).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AppealError('invalid_token');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new AppealError('invalid_token');
  }
  const parsed = claimsSchema.safeParse(decoded);
  if (!parsed.success || parsed.data.expiresAt > now + APPEAL_LIFETIME_MS) {
    throw new AppealError('invalid_token');
  }
  if (parsed.data.expiresAt <= now) throw new AppealError('expired_token');
  return parsed.data;
}

export function hashAppealToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function hashAppealRecipient(email: string) {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

export const appealRequestSchema = z
  .object({
    email: z
      .email()
      .max(320)
      .transform((value) => value.trim().toLowerCase()),
    reason: z.string().trim().min(10).max(2000),
  })
  .strict();
