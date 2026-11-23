import { guardSourceBucket } from '@tuturuuu/utils/abuse-guard/source';
import { secretKeyPart } from '@/lib/external-apps/exchange-rate-limit';
import {
  consume,
  KEY_PREFIX,
  keyPart,
} from '@/lib/external-apps/rate-limit-core';

export type AccountLinkRoute = 'introspect' | 'link' | 'unlink';

function prefix(route: AccountLinkRoute) {
  return `${KEY_PREFIX}:account-link:${route}`;
}

/**
 * Admits a request before its credentials are checked: per client IP, and
 * per app and keyed digest of the presented secret, so a flood of wrong
 * secrets under an app's id fills only its own buckets.
 */
export function admitAccountLinkRequest({
  appId,
  appSecret,
  ip,
  route,
}: {
  appId: string;
  appSecret?: string;
  ip: string;
  route: AccountLinkRoute;
}) {
  return consume([
    {
      bucket: 'accountLinkIp',
      failClosed: true,
      key: `${prefix(route)}:ip:${keyPart(guardSourceBucket(ip))}`,
    },
    {
      bucket: 'accountLinkAttempt',
      failClosed: true,
      key: `${prefix(route)}:app:${keyPart(appId)}:secret:${secretKeyPart(appSecret)}`,
    },
  ]);
}

/** Counts a request whose app credentials verified, per app and user. */
export function limitVerifiedAccountLinkRequest({
  appId,
  route,
  userId,
}: {
  appId: string;
  route: AccountLinkRoute;
  userId?: string;
}) {
  return consume([
    {
      bucket: 'accountLinkApp',
      failClosed: true,
      key: `${prefix(route)}:app:${keyPart(appId)}`,
    },
    ...(userId
      ? [
          {
            bucket: 'accountLinkUser' as const,
            failClosed: true,
            key: `${prefix(route)}:app:${keyPart(appId)}:user:${keyPart(userId)}`,
          },
        ]
      : []),
  ]);
}
