import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import {
  AppealError,
  storedAppealReasonSchema,
  appealRequestSchema,
  hashAppealToken,
  issueAppealToken,
  verifyAppealToken,
} from './domain';
import type { AppealMailer } from './mailer';

export type AppealStore = {
  request(input: {
    wsId: string;
    actorId: string;
    email: string;
    reason: string;
    tokenHash: string;
  }): Promise<unknown>;
  claimDelivery(id: string): Promise<unknown>;
  markDelivery(
    id: string,
    outcome: 'sent' | 'failed' | 'unknown' | 'waiting_recipient' | 'unavailable'
  ): Promise<void>;
  confirm(tokenHash: string): Promise<unknown>;
};

const reservedSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  reason: storedAppealReasonSchema,
  status: z.literal('pending'),
  expires_at: z.string(),
});
const confirmedSchema = z.object({
  status: z.enum(['confirmed', 'expired', 'invalid', 'reblocked']),
});
const deliveryClaimSchema = z.object({ status: z.string() });

export async function requestAppeal(
  input: {
    wsId: string;
    actorId: string;
    email: string;
    reason: string;
  },
  dependencies: {
    store: AppealStore;
    key: string;
    origin: string;
    mailer: AppealMailer | null;
    checkMx: (email: string) => Promise<boolean>;
    now?: number;
  }
): Promise<{
  status: 'sent' | 'waiting_recipient' | 'unavailable' | 'unknown';
}> {
  const parsed = appealRequestSchema.safeParse({
    email: input.email,
    reason: input.reason,
  });
  if (!parsed.success) throw new AppealError('invalid_request');
  const canSign = Buffer.byteLength(dependencies.key) >= 32;
  const token = canSign
    ? issueAppealToken(input.wsId, dependencies.key, dependencies.now)
    : randomBytes(32).toString('base64url');
  const reserved = reservedSchema.safeParse(
    await dependencies.store.request({
      wsId: input.wsId,
      actorId: input.actorId,
      ...parsed.data,
      tokenHash: hashAppealToken(token),
    })
  );
  if (!reserved.success) throw new AppealError('store_unavailable');
  const row = reserved.data;
  if (row.reason === 'spam_complaint') {
    // Admin intent cannot bootstrap consent by contacting a complainant.
    await dependencies.store.markDelivery(row.id, 'waiting_recipient');
    return { status: 'waiting_recipient' };
  }
  if (row.reason === 'manual') {
    await dependencies.store.markDelivery(row.id, 'failed');
    throw new AppealError('not_appealable');
  }
  if (
    row.reason === 'hard_bounce' &&
    !(await dependencies.checkMx(row.email))
  ) {
    await dependencies.store.markDelivery(row.id, 'failed');
    throw new AppealError('deliverability_failed');
  }
  if (!canSign || !dependencies.mailer?.reviewReceipt) {
    await dependencies.store.markDelivery(row.id, 'unavailable');
    return { status: 'unavailable' };
  }
  const claim = deliveryClaimSchema.safeParse(
    await dependencies.store.claimDelivery(row.id)
  );
  if (!claim.success) throw new AppealError('store_unavailable');
  if (claim.data.status !== 'dispatching') return { status: 'unavailable' };
  const url = new URL('/en/email-appeals', dependencies.origin);
  url.hash = new URLSearchParams({ token }).toString();
  try {
    await dependencies.mailer.sendConfirmation({
      email: row.email,
      url: url.toString(),
      wsId: input.wsId,
      reason: row.reason,
    });
  } catch {
    // An unknown send is terminal: a retry could send the same challenge twice.
    await dependencies.store.markDelivery(row.id, 'unknown');
    return { status: 'unknown' };
  }
  await dependencies.store.markDelivery(row.id, 'sent');
  return { status: 'sent' };
}

export async function confirmAppeal(
  token: string,
  dependencies: {
    store: AppealStore;
    key: string;
    isEnabled: (wsId: string) => Promise<boolean>;
    now?: number;
  }
): Promise<{ status: 'confirmed' }> {
  const claims = verifyAppealToken(token, dependencies.key, dependencies.now);
  if (!(await dependencies.isEnabled(claims.wsId)))
    throw new AppealError('flag_disabled');
  const parsed = confirmedSchema.safeParse(
    await dependencies.store.confirm(hashAppealToken(token))
  );
  if (!parsed.success) throw new AppealError('store_unavailable');
  if (parsed.data.status === 'expired') throw new AppealError('expired_token');
  if (parsed.data.status !== 'confirmed')
    throw new AppealError('invalid_token');
  return { status: 'confirmed' };
}
