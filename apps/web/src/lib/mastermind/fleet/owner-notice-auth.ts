import { createHash, timingSafeEqual } from 'node:crypto';

export const OWNER_NOTICE_AUTH_PATH =
  '/api/v1/mastermind/fleet/live/owner-authorization';

const digest = (value: string) => createHash('sha256').update(value).digest();

export function hasOwnerNoticeServiceCredential(
  request: Pick<Request, 'headers'>
) {
  const token = process.env.MASTERMIND_STORE_TOKEN?.trim();
  const authorization = request.headers.get('authorization');
  return Boolean(
    token &&
    token.length >= 32 &&
    authorization &&
    timingSafeEqual(digest(authorization), digest(`Bearer ${token}`))
  );
}
