import { UPSKII_APP_ID } from './constants';
import { guardSourceBucket } from '@tuturuuu/utils/abuse-guard/source';
import { secretKeyPart } from '@/lib/external-apps/exchange-rate-limit';
import {
  consume,
  KEY_PREFIX,
  keyPart,
} from '@/lib/external-apps/rate-limit-core';

export type AccountLinkRoute =
  | 'introspect'
  | 'link'
  | 'link-status'
  | 'live-class'
  | 'live-class-status'
  | 'unlink';

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
  // A valid-shaped status credential gets an isolated pre-auth secret bucket.
  // Invalid secrets still meet the source lock and failure pacing in access.ts.
  const statusCredential =
    route === 'live-class-status' && appId === UPSKII_APP_ID && !!appSecret;
  const counters = [
    {
      bucket: statusCredential ? 'liveClassStatusApp' : 'accountLinkAttempt',
      failClosed: true,
      key: `${prefix(route)}:app:${keyPart(appId)}:secret:${secretKeyPart(appSecret)}`,
    },
  ] satisfies Parameters<typeof consume>[0];
  return consume(
    statusCredential
      ? counters
      : [
          {
            bucket: 'accountLinkIp',
            failClosed: true,
            key: `${prefix(route)}:ip:${keyPart(guardSourceBucket(ip))}`,
          },
          ...counters,
        ]
  );
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
      bucket:
        route === 'live-class-status' ? 'liveClassStatusApp' : 'accountLinkApp',
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

/** Bounds status work for one class across all callers and app instances. */
export function limitLiveClassStatus(classId: string) {
  return consume([
    {
      bucket: 'liveClassStatus',
      failClosed: true,
      key: `${prefix('live-class-status')}:class:${keyPart(classId)}`,
    },
  ]);
}
