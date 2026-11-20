import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

export const statusLinkToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export function createStatusLinkToken() {
  return randomBytes(32).toString('base64url');
}

export function digestStatusLinkToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function billSplitStatusOrigin(): URL | null {
  if (
    process.env.ENABLE_FINANCE_BILL_SPLITS !== 'true' ||
    process.env.ENABLE_FINANCE_BILL_SPLIT_STATUS_LINKS !== 'true'
  )
    return null;

  try {
    const config = new URL(process.env.FINANCE_BILL_SPLIT_STATUS_ORIGIN ?? '');
    return config.protocol === 'https:' && config.href === `${config.origin}/`
      ? config
      : null;
  } catch {
    return null;
  }
}
