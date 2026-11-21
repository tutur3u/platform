import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import {
  Environment,
  SignedDataVerifier,
  Type,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
} from '@apple/app-store-server-library';

type AppleEnvironment = 'Production' | 'Sandbox';
type FailureCode =
  | 'invalid_input'
  | 'verification_failed'
  | 'identity_mismatch'
  | 'product_not_allowed';
type VerificationResult<T> =
  | { kind: 'verified'; value: T }
  | { kind: 'rejected'; category: FailureCode };

export type AppleServerVerifierConfig = Readonly<{
  // These DER bytes and fingerprints come from reviewed source, never a request.
  pinnedRoots: readonly [
    { der: Uint8Array; sha256: string },
    ...{ der: Uint8Array; sha256: string }[],
  ];
  environment: AppleEnvironment;
  bundleId: string;
  appAppleId: number;
  productIds: readonly [string, ...string[]];
}>;

export type VerifiedAppleSubscription = Readonly<{
  environment: AppleEnvironment;
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  appAccountToken: string;
  purchaseDate: number;
  expiresDate: number;
  signedDate: number;
  revocationDate: number | null;
  isUpgraded: boolean;
}>;

export type VerifiedAppleNotification =
  | {
      kind: 'test';
      notificationUUID: string;
      signedDate: number;
    }
  | {
      kind: 'subscription';
      notificationUUID: string;
      signedDate: number;
      notificationType: string;
      subtype: string | null;
      transaction: VerifiedAppleSubscription;
      renewal: JWSRenewalInfoDecodedPayload | null;
    };

class PolicyFailure extends Error {
  constructor(readonly category: FailureCode) {
    super(category);
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxJwsBytes = 128 * 1024;

function requireEs256(jws: string): void {
  if (
    typeof jws !== 'string' ||
    jws.length > maxJwsBytes ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jws)
  ) {
    throw new PolicyFailure('invalid_input');
  }
  const [headerPart] = jws.split('.');
  if (!headerPart) throw new PolicyFailure('invalid_input');
  let header: unknown;
  try {
    header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
  } catch {
    throw new PolicyFailure('invalid_input');
  }
  if (
    typeof header !== 'object' ||
    header === null ||
    !('alg' in header) ||
    header.alg !== 'ES256' ||
    !('x5c' in header) ||
    !Array.isArray(header.x5c) ||
    header.x5c.length !== 3 ||
    !header.x5c.every((certificate: unknown) => typeof certificate === 'string')
  ) {
    throw new PolicyFailure('invalid_input');
  }
}

function requiredString(value: string | undefined): string {
  if (!value || value.length > 256) throw new PolicyFailure('invalid_input');
  return value;
}

function token(value: string | undefined): string {
  if (!value || !uuid.test(value)) throw new PolicyFailure('identity_mismatch');
  return value.toLowerCase();
}

function timestamp(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || value === undefined || value <= 0) {
    throw new PolicyFailure('invalid_input');
  }
  return value;
}

function signedTimestamp(value: number | undefined): number {
  const date = timestamp(value);
  // Old signed transactions remain restorable; freshness is not ownership.
  if (date > Date.now() + 60_000) throw new PolicyFailure('invalid_input');
  return date;
}

async function result<T>(
  work: () => Promise<T>
): Promise<VerificationResult<T>> {
  try {
    return { kind: 'verified', value: await work() };
  } catch (error) {
    return {
      kind: 'rejected',
      category:
        error instanceof PolicyFailure ? error.category : 'verification_failed',
    };
  }
}

/** Explicit Node/server adapter; do not re-export through portable payment entrypoints. */
export function createAppleServerVerifier(config: AppleServerVerifierConfig) {
  if (
    !['Production', 'Sandbox'].includes(config.environment) ||
    !config.bundleId ||
    !Number.isSafeInteger(config.appAppleId) ||
    config.appAppleId <= 0 ||
    config.productIds.length === 0 ||
    config.pinnedRoots.length === 0
  ) {
    throw new Error('Invalid Apple verifier configuration');
  }
  const roots = config.pinnedRoots.map((root) => {
    const der = Buffer.from(root.der);
    if (
      !/^[a-f0-9]{64}$/i.test(root.sha256) ||
      createHash('sha256').update(der).digest('hex') !==
        root.sha256.toLowerCase()
    ) {
      throw new Error('Invalid Apple root pin');
    }
    return der;
  });
  const products = new Set(config.productIds);
  const verifier = new SignedDataVerifier(
    roots,
    true,
    config.environment === 'Production'
      ? Environment.PRODUCTION
      : Environment.SANDBOX,
    config.bundleId,
    config.appAppleId
  );

  function product(productId: string | undefined): string {
    if (!productId || !products.has(productId)) {
      throw new PolicyFailure('product_not_allowed');
    }
    return productId;
  }

  function subscription(
    value: JWSTransactionDecodedPayload
  ): VerifiedAppleSubscription {
    if (
      value.bundleId !== config.bundleId ||
      value.environment !== config.environment ||
      value.type !== Type.AUTO_RENEWABLE_SUBSCRIPTION ||
      value.quantity !== 1 ||
      value.inAppOwnershipType !== 'PURCHASED'
    ) {
      throw new PolicyFailure('identity_mismatch');
    }
    const purchaseDate = timestamp(value.purchaseDate);
    const expiresDate = timestamp(value.expiresDate);
    if (expiresDate <= purchaseDate) throw new PolicyFailure('invalid_input');
    return {
      environment: config.environment,
      transactionId: requiredString(value.transactionId),
      originalTransactionId: requiredString(value.originalTransactionId),
      productId: product(value.productId),
      appAccountToken: token(value.appAccountToken),
      purchaseDate,
      expiresDate,
      signedDate: signedTimestamp(value.signedDate),
      revocationDate:
        value.revocationDate === undefined
          ? null
          : timestamp(value.revocationDate),
      isUpgraded: value.isUpgraded === true,
    };
  }

  async function renewal(
    jws: string | undefined,
    transaction: VerifiedAppleSubscription
  ) {
    if (jws === undefined) return null;
    requireEs256(jws);
    const value = await verifier.verifyAndDecodeRenewalInfo(jws);
    if (
      value.environment !== config.environment ||
      value.originalTransactionId !== transaction.originalTransactionId ||
      product(value.productId) !== transaction.productId ||
      (value.appAccountToken !== undefined &&
        token(value.appAccountToken) !== transaction.appAccountToken)
    ) {
      throw new PolicyFailure('identity_mismatch');
    }
    if (value.autoRenewProductId !== undefined)
      product(value.autoRenewProductId);
    signedTimestamp(value.signedDate);
    return value;
  }

  return {
    verifyPurchase(request: {
      signedTransaction: string;
      signedAppTransaction?: string;
      signedRenewal?: string;
      // Both values must be resolved from the authenticated server actor record.
      actorId: string;
      expectedAppAccountToken: string;
    }) {
      return result(async () => {
        requireEs256(request.signedTransaction);
        if (!uuid.test(request.actorId))
          throw new PolicyFailure('identity_mismatch');
        const decoded = await verifier.verifyAndDecodeTransaction(
          request.signedTransaction
        );
        if (request.signedAppTransaction !== undefined) {
          requireEs256(request.signedAppTransaction);
          const app = await verifier.verifyAndDecodeAppTransaction(
            request.signedAppTransaction
          );
          if (
            app.bundleId !== config.bundleId ||
            app.appAppleId !== config.appAppleId ||
            app.receiptType !== config.environment ||
            (app.appTransactionId !== undefined &&
              decoded.appTransactionId !== undefined &&
              app.appTransactionId !== decoded.appTransactionId)
          ) {
            throw new PolicyFailure('identity_mismatch');
          }
          signedTimestamp(app.receiptCreationDate);
        }
        const transaction = subscription(decoded);
        if (
          transaction.appAccountToken !== token(request.expectedAppAccountToken)
        ) {
          throw new PolicyFailure('identity_mismatch');
        }
        return {
          actorId: request.actorId,
          transaction,
          renewal: await renewal(request.signedRenewal, transaction),
        };
      });
    },

    verifyNotification(
      signedPayload: string
    ): Promise<VerificationResult<VerifiedAppleNotification>> {
      return result<VerifiedAppleNotification>(async () => {
        requireEs256(signedPayload);
        const notification =
          await verifier.verifyAndDecodeNotification(signedPayload);
        const data = notification.data;
        if (
          notification.version !== '2.0' ||
          !data ||
          data.bundleId !== config.bundleId ||
          (data.appAppleId !== undefined &&
            data.appAppleId !== config.appAppleId) ||
          data.environment !== config.environment
        ) {
          throw new PolicyFailure('identity_mismatch');
        }
        const notificationUUID = token(notification.notificationUUID);
        const signedDate = signedTimestamp(notification.signedDate);
        if (notification.notificationType === 'TEST') {
          return { kind: 'test', notificationUUID, signedDate };
        }
        const transactionJws = data.signedTransactionInfo;
        if (!transactionJws) throw new PolicyFailure('invalid_input');
        requireEs256(transactionJws);
        const transaction = subscription(
          await verifier.verifyAndDecodeTransaction(transactionJws)
        );
        return {
          kind: 'subscription',
          notificationUUID,
          signedDate,
          notificationType: requiredString(notification.notificationType),
          subtype: notification.subtype ?? null,
          transaction,
          renewal: await renewal(data.signedRenewalInfo, transaction),
        };
      });
    },
  };
}
