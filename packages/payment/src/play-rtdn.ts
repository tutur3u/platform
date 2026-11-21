import { z } from 'zod';
import {
  readPlayBoundedJson,
  type PlayVerificationResult,
  type VerifiedPlaySubscription,
} from './play-server-verifier';

const identifier = z.string().min(1).max(256);
const purchaseToken = z.string().min(1).max(4096);
const envelopeSchema = z.object({
  subscription: z.string().min(1).max(512),
  message: z.object({
    messageId: identifier,
    data: z
      .string()
      .min(4)
      .max(48 * 1024),
    publishTime: z.string().datetime({ offset: true }),
  }),
});
const notificationSchema = z
  .object({
    version: z.literal('1.0'),
    packageName: identifier,
    eventTimeMillis: z.string().regex(/^\d{1,16}$/),
    subscriptionNotification: z
      .object({
        version: z.literal('1.0'),
        notificationType: z.number().int().positive().max(1000),
        purchaseToken,
      })
      .optional(),
    voidedPurchaseNotification: z
      .object({
        purchaseToken,
        productType: z.literal(1),
        orderId: identifier,
      })
      .optional(),
    testNotification: z.object({ version: z.literal('1.0') }).optional(),
  })
  .strict();
const claimsSchema = z.object({
  iss: z.enum(['accounts.google.com', 'https://accounts.google.com']),
  aud: z.string(),
  sub: z.string(),
  email: z.string().email(),
  email_verified: z.literal(true),
  exp: z.number().int(),
  iat: z.number().int(),
});

export type PlayRtdnPolicy = Readonly<{
  packageName: string;
  audience: string;
  pushSubscription: string;
  serviceAccountEmail: string;
  serviceAccountSubject: string;
}>;
export interface PlayOidcVerifier {
  // Must verify Google's signature, issuer, keys and temporal claims. Decoding
  // JWT claims alone does not satisfy this cryptographic boundary.
  verify(
    token: string,
    audience: string,
    signal: AbortSignal
  ): Promise<unknown>;
}
export interface PlayRtdnRepository {
  resolveOwner(token: string): Promise<{
    actorId: string;
    accountId: string;
  } | null>;
  // One DB transaction locks token/actor, validates immutable ownership and
  // reconciles latest verified state with receipt insertion. A duplicate message
  // still returns the persisted acknowledgement obligation if not yet fulfilled.
  reconcile(input: {
    messageId: string;
    purchaseToken: string;
    observedAt: number;
    eventTime: number;
    subscription: VerifiedPlaySubscription;
  }): Promise<{
    kind: 'committed' | 'duplicate';
    acknowledgement: VerifiedPlaySubscription | null;
  }>;
}
export interface PlayRtdnDependencies {
  oidc: PlayOidcVerifier;
  repository: PlayRtdnRepository;
  subscriptions: {
    verify(input: {
      purchaseToken: string;
      actorId: string;
      expectedAccountId: string;
    }): Promise<PlayVerificationResult>;
    acknowledgeCommitted(
      subscription: VerifiedPlaySubscription
    ): Promise<boolean>;
  };
  now?: () => number;
}
export type PlayRtdnResult =
  | { kind: 'accepted'; disposition: 'test' | 'committed' | 'duplicate' }
  | {
      kind: 'rejected';
      status: 400 | 401 | 413 | 415 | 503;
      category: 'input' | 'authentication' | 'unavailable';
    };

function decodeNotification(data: string): unknown {
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      data
    )
  ) {
    throw new Error('Invalid base64');
  }
  const binary = atob(data);
  if (binary.length > 32 * 1024) throw new Error('Notification too large');
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}

export function createPlayRtdnProcessor(
  policy: PlayRtdnPolicy,
  dependencies: PlayRtdnDependencies
) {
  if (
    !policy.packageName ||
    !policy.audience ||
    !policy.pushSubscription ||
    !policy.serviceAccountEmail ||
    !policy.serviceAccountSubject
  ) {
    throw new Error('Incomplete Play push policy');
  }
  const now = dependencies.now ?? Date.now;
  return async function process(request: Request): Promise<PlayRtdnResult> {
    const contentType = request.headers
      .get('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase();
    if (request.method !== 'POST')
      return { kind: 'rejected', status: 400, category: 'input' };
    if (contentType !== 'application/json')
      return { kind: 'rejected', status: 415, category: 'input' };
    const length = request.headers.get('content-length');
    if (
      length !== null &&
      (!/^\d+$/.test(length) || Number(length) > 64 * 1024)
    ) {
      return { kind: 'rejected', status: 413, category: 'input' };
    }
    const authorization = request.headers.get('authorization');
    if (
      !authorization ||
      authorization.length > 16 * 1024 ||
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
        authorization
      )
    ) {
      return { kind: 'rejected', status: 401, category: 'authentication' };
    }
    try {
      const claims = claimsSchema.parse(
        await dependencies.oidc.verify(
          authorization.slice(7),
          policy.audience,
          AbortSignal.timeout(10_000)
        )
      );
      const seconds = now() / 1000;
      if (
        claims.aud !== policy.audience ||
        claims.sub !== policy.serviceAccountSubject ||
        claims.email !== policy.serviceAccountEmail ||
        claims.exp <= seconds ||
        claims.iat > seconds + 60 ||
        claims.iat >= claims.exp
      ) {
        return { kind: 'rejected', status: 401, category: 'authentication' };
      }
    } catch {
      return { kind: 'rejected', status: 401, category: 'authentication' };
    }

    let envelope: z.infer<typeof envelopeSchema>;
    let notification: z.infer<typeof notificationSchema>;
    try {
      envelope = envelopeSchema.parse(
        await readPlayBoundedJson(request.body, 64 * 1024)
      );
      notification = notificationSchema.parse(
        decodeNotification(envelope.message.data)
      );
      const eventTime = Number(notification.eventTimeMillis);
      const variants =
        Number(notification.subscriptionNotification !== undefined) +
        Number(notification.voidedPurchaseNotification !== undefined) +
        Number(notification.testNotification !== undefined);
      if (
        envelope.subscription !== policy.pushSubscription ||
        notification.packageName !== policy.packageName ||
        variants !== 1 ||
        !Number.isSafeInteger(eventTime) ||
        eventTime <= 0 ||
        eventTime > now() + 60_000
      ) {
        return { kind: 'rejected', status: 400, category: 'input' };
      }
    } catch {
      return { kind: 'rejected', status: 400, category: 'input' };
    }
    if (notification.testNotification)
      return { kind: 'accepted', disposition: 'test' };
    const token =
      notification.subscriptionNotification?.purchaseToken ??
      notification.voidedPurchaseNotification?.purchaseToken;
    if (!token) return { kind: 'rejected', status: 400, category: 'input' };
    try {
      const owner = await dependencies.repository.resolveOwner(token);
      // An RTDN arriving before initial authenticated purchase linking retries;
      // it cannot attach itself to a caller-chosen actor or create ownership.
      if (!owner)
        return { kind: 'rejected', status: 503, category: 'unavailable' };
      const observedAt = now();
      const verified = await dependencies.subscriptions.verify({
        purchaseToken: token,
        actorId: owner.actorId,
        expectedAccountId: owner.accountId,
      });
      if (verified.kind !== 'verified') {
        return { kind: 'rejected', status: 503, category: 'unavailable' };
      }
      const committed = await dependencies.repository.reconcile({
        messageId: envelope.message.messageId,
        purchaseToken: token,
        observedAt,
        eventTime: Number(notification.eventTimeMillis),
        subscription: verified.subscription,
      });
      if (committed.acknowledgement) {
        const acknowledgement = committed.acknowledgement;
        if (
          acknowledgement.purchaseToken !== token ||
          acknowledgement.actorId !== owner.actorId ||
          acknowledgement.accountId !== owner.accountId ||
          acknowledgement.packageName !== policy.packageName ||
          acknowledgement.environment !== verified.subscription.environment ||
          !(await dependencies.subscriptions.acknowledgeCommitted(
            acknowledgement
          ))
        ) {
          return { kind: 'rejected', status: 503, category: 'unavailable' };
        }
      }
      return { kind: 'accepted', disposition: committed.kind };
    } catch {
      return { kind: 'rejected', status: 503, category: 'unavailable' };
    }
  };
}
