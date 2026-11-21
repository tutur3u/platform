import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const receiptLifetimeSeconds = 7 * 24 * 60 * 60;

export function recurrenceReceiptKey(secret: string | undefined) {
  return secret && Buffer.byteLength(secret, 'utf8') >= 32 ? secret : null;
}

function signature(
  secret: string,
  workspace: string,
  actor: string,
  body: string
) {
  return createHmac('sha256', secret)
    .update(JSON.stringify(['task-recurrence-v1', workspace, actor, body]))
    .digest();
}

export function issueRecurrenceReceipt(
  secret: string,
  workspace: string,
  actor: string,
  now = Date.now()
) {
  const body = `${randomUUID()}.${Math.floor(now / 1000) + receiptLifetimeSeconds}`;
  return `${body}.${signature(secret, workspace, actor, body).toString('base64url')}`;
}

export function verifyRecurrenceReceipt(
  secret: string,
  workspace: string,
  actor: string,
  token: string,
  now = Date.now()
) {
  const [id, expiry, mac, extra] = token.split('.');
  if (
    extra !== undefined ||
    !id ||
    !z.uuid().safeParse(id).success ||
    !expiry ||
    !/^\d{1,12}$/.test(expiry) ||
    !mac ||
    !/^[A-Za-z0-9_-]{43}$/.test(mac)
  )
    return null;
  const expireMs = Number(expiry) * 1000;
  if (expireMs <= now || expireMs > now + receiptLifetimeSeconds * 1000)
    return null;
  const decoded = Buffer.from(mac, 'base64url');
  const expected = signature(secret, workspace, actor, `${id}.${expiry}`);
  if (decoded.length !== expected.length || !timingSafeEqual(decoded, expected))
    return null;
  return { p_request: id, p_expires_at: new Date(expireMs).toISOString() };
}
