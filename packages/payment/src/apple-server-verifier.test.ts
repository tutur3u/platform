import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import type {
  AppTransaction,
  JWSRenewalInfoDecodedPayload,
  JWSTransactionDecodedPayload,
  ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cryptoBoundary = vi.hoisted(() => ({
  construct: vi.fn(),
  transaction: vi.fn(),
  app: vi.fn(),
  notification: vi.fn(),
  renewal: vi.fn(),
}));

// These tests isolate adapter policy. They do not prove Apple's cryptography or
// Worker compatibility; real sandbox and forged-chain runtime tests remain gates.
vi.mock('@apple/app-store-server-library', () => ({
  Environment: { PRODUCTION: 'Production', SANDBOX: 'Sandbox' },
  Type: { AUTO_RENEWABLE_SUBSCRIPTION: 'Auto-Renewable Subscription' },
  SignedDataVerifier: class {
    constructor(...args: unknown[]) {
      cryptoBoundary.construct(...args);
    }
    verifyAndDecodeTransaction = cryptoBoundary.transaction;
    verifyAndDecodeAppTransaction = cryptoBoundary.app;
    verifyAndDecodeNotification = cryptoBoundary.notification;
    verifyAndDecodeRenewalInfo = cryptoBoundary.renewal;
  },
}));

import {
  createAppleServerVerifier,
  type AppleServerVerifierConfig,
} from './apple-server-verifier';

const actorId = '00000000-0000-4000-8000-000000000001';
const accountToken = '00000000-0000-4000-8000-000000000002';
const notificationUUID = '00000000-0000-4000-8000-000000000003';
const productId = 'com.tuturuuu.app.mobile.plus.monthly';
const now = 1_700_000_000_000;

function jws(alg = 'ES256') {
  const header = Buffer.from(JSON.stringify({ alg, x5c: ['a', 'b', 'c'] }));
  return `${header.toString('base64url')}.e30.c2ln`;
}

function config(): AppleServerVerifierConfig {
  const der = Buffer.from('policy-test-only-root');
  return {
    pinnedRoots: [
      { der, sha256: createHash('sha256').update(der).digest('hex') },
    ],
    environment: 'Production',
    bundleId: 'com.tuturuuu.app.mobile',
    appAppleId: 123,
    productIds: [productId],
  };
}

function transaction(
  overrides: Partial<JWSTransactionDecodedPayload> = {}
): JWSTransactionDecodedPayload {
  return {
    transactionId: '100',
    originalTransactionId: '90',
    appTransactionId: 'app-10',
    appAccountToken: accountToken,
    bundleId: 'com.tuturuuu.app.mobile',
    environment: 'Production',
    type: 'Auto-Renewable Subscription',
    inAppOwnershipType: 'PURCHASED',
    quantity: 1,
    productId,
    purchaseDate: now - 1000,
    expiresDate: now + 1000,
    signedDate: now,
    ...overrides,
  };
}

function app(overrides: Partial<AppTransaction> = {}): AppTransaction {
  return {
    bundleId: 'com.tuturuuu.app.mobile',
    appAppleId: 123,
    appTransactionId: 'app-10',
    receiptType: 'Production',
    receiptCreationDate: now,
    ...overrides,
  };
}

function notification(
  overrides: Partial<ResponseBodyV2DecodedPayload> = {}
): ResponseBodyV2DecodedPayload {
  return {
    version: '2.0',
    notificationType: 'DID_RENEW',
    notificationUUID,
    signedDate: now,
    data: {
      bundleId: 'com.tuturuuu.app.mobile',
      appAppleId: 123,
      environment: 'Production',
      signedTransactionInfo: jws(),
      signedRenewalInfo: jws(),
    },
    ...overrides,
  };
}

function purchase() {
  return {
    signedTransaction: jws(),
    signedAppTransaction: jws(),
    actorId,
    expectedAppAccountToken: accountToken,
  };
}

describe('Apple server adapter policy, cryptography boundary mocked', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    cryptoBoundary.transaction.mockResolvedValue(transaction());
    cryptoBoundary.app.mockResolvedValue(app());
    cryptoBoundary.notification.mockResolvedValue(notification());
    const renewal: JWSRenewalInfoDecodedPayload = {
      environment: 'Production',
      originalTransactionId: '90',
      productId,
      autoRenewProductId: productId,
      appAccountToken: accountToken,
      signedDate: now,
    };
    cryptoBoundary.renewal.mockResolvedValue(renewal);
  });

  it('uses pinned roots and enables official online revocation checks', async () => {
    const settings = config();
    const verifier = createAppleServerVerifier(settings);
    expect(cryptoBoundary.construct).toHaveBeenCalledWith(
      [Buffer.from(settings.pinnedRoots[0].der)],
      true,
      'Production',
      settings.bundleId,
      settings.appAppleId
    );
    expect(await verifier.verifyPurchase(purchase())).toMatchObject({
      kind: 'verified',
      value: { actorId, transaction: { transactionId: '100' } },
    });
  });

  it.each(['not-jws', jws('none'), jws('ES384'), 'a'.repeat(128 * 1024 + 1)])(
    'rejects malformed or unsupported JWS before the crypto boundary',
    async (signedTransaction) => {
      const result = await createAppleServerVerifier(config()).verifyPurchase({
        ...purchase(),
        signedTransaction,
      });
      expect(result).toEqual({ kind: 'rejected', category: 'invalid_input' });
      expect(cryptoBoundary.transaction).not.toHaveBeenCalled();
      expect(cryptoBoundary.app).not.toHaveBeenCalled();
    }
  );

  it('does not expose a crypto exception or forged evidence as claims', async () => {
    cryptoBoundary.transaction.mockRejectedValue(
      new Error('private payload detail')
    );
    expect(
      await createAppleServerVerifier(config()).verifyPurchase(purchase())
    ).toEqual({
      kind: 'rejected',
      category: 'verification_failed',
    });
  });

  it('accepts actor-bound signed transaction without optional AppTransaction proof', async () => {
    expect(
      await createAppleServerVerifier(config()).verifyPurchase({
        signedTransaction: jws(),
        actorId,
        expectedAppAccountToken: accountToken,
      })
    ).toMatchObject({ kind: 'verified', value: { actorId } });
    expect(cryptoBoundary.app).not.toHaveBeenCalled();
  });

  it.each([
    { bundleId: 'another.app' },
    { environment: 'Sandbox' },
    { appAccountToken: actorId },
    { appTransactionId: 'another-app-transaction' },
    { type: 'Consumable' },
    { inAppOwnershipType: 'FAMILY_SHARED' },
  ])('rejects mismatched transaction identity %j', async (overrides) => {
    cryptoBoundary.transaction.mockResolvedValue(transaction(overrides));
    expect(
      await createAppleServerVerifier(config()).verifyPurchase(purchase())
    ).toEqual({
      kind: 'rejected',
      category: 'identity_mismatch',
    });
  });

  it('rejects a product not present in the server allowlist', async () => {
    cryptoBoundary.transaction.mockResolvedValue(
      transaction({ productId: 'client-selected-product' })
    );
    expect(
      await createAppleServerVerifier(config()).verifyPurchase(purchase())
    ).toEqual({
      kind: 'rejected',
      category: 'product_not_allowed',
    });
  });

  it('checks appAppleId when optional signed app identity proof is supplied', async () => {
    cryptoBoundary.app.mockResolvedValue(app({ appAppleId: 456 }));
    expect(
      await createAppleServerVerifier(config()).verifyPurchase(purchase())
    ).toEqual({
      kind: 'rejected',
      category: 'identity_mismatch',
    });
  });

  it('verifies nested notification signatures and retains revocation for projection', async () => {
    cryptoBoundary.transaction.mockResolvedValue(
      transaction({ revocationDate: now })
    );
    expect(
      await createAppleServerVerifier(config()).verifyNotification(jws())
    ).toMatchObject({
      kind: 'verified',
      value: {
        kind: 'subscription',
        notificationUUID,
        transaction: { revocationDate: now },
      },
    });
    expect(cryptoBoundary.transaction).toHaveBeenCalledWith(jws());
    expect(cryptoBoundary.renewal).toHaveBeenCalledWith(jws());
  });

  it('rejects a mismatched renewal chain', async () => {
    cryptoBoundary.renewal.mockResolvedValue({
      environment: 'Production',
      originalTransactionId: 'different',
      productId,
      signedDate: now,
    });
    expect(
      await createAppleServerVerifier(config()).verifyNotification(jws())
    ).toEqual({
      kind: 'rejected',
      category: 'identity_mismatch',
    });
  });

  it('rejects nested signature verification failure', async () => {
    cryptoBoundary.renewal.mockRejectedValue(new Error('signature mismatch'));
    expect(
      await createAppleServerVerifier(config()).verifyNotification(jws())
    ).toEqual({
      kind: 'rejected',
      category: 'verification_failed',
    });
  });

  it('rejects sandbox envelope data in production', async () => {
    const value = notification();
    cryptoBoundary.notification.mockResolvedValue({
      ...value,
      data: { ...value.data, environment: 'Sandbox' },
    });
    expect(
      await createAppleServerVerifier(config()).verifyNotification(jws())
    ).toEqual({
      kind: 'rejected',
      category: 'identity_mismatch',
    });
  });

  it('refuses configuration when source certificate bytes do not match the pin', () => {
    expect(() =>
      createAppleServerVerifier({
        ...config(),
        pinnedRoots: [{ der: Buffer.from('changed'), sha256: '0'.repeat(64) }],
      })
    ).toThrow('Invalid Apple root pin');
  });
});
