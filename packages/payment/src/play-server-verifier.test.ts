import { describe, expect, it, vi } from 'vitest';
import {
  createPlayServerVerifier,
  type PlayVerifierConfig,
} from './play-server-verifier';

const actorId = '00000000-0000-4000-8000-000000000001';
const now = Date.parse('2026-11-16T10:00:00Z');
const config: PlayVerifierConfig = {
  packageName: 'com.tuturuuu.app.mobile',
  environment: 'production',
  products: [
    { productId: 'tuturuuu_plus', basePlanId: 'monthly', profile: 'plus' },
  ],
};
function evidence(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'androidpublisher#subscriptionPurchaseV2',
    subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
    acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
    externalAccountIdentifiers: {
      obfuscatedExternalAccountId: 'server-account',
    },
    lineItems: [
      {
        productId: 'tuturuuu_plus',
        expiryTime: '2026-12-16T10:00:00Z',
        offerDetails: { basePlanId: 'monthly' },
        autoRenewingPlan: { autoRenewEnabled: true },
      },
    ],
    ...overrides,
  };
}
function fixture(body: unknown = evidence()) {
  const fetch = vi.fn().mockImplementation(async () => Response.json(body));
  const accessToken = vi.fn().mockResolvedValue('synthetic-server-credential');
  return {
    fetch,
    accessToken,
    verifier: createPlayServerVerifier(
      config,
      { fetch, accessToken },
      () => now
    ),
  };
}
const request = {
  purchaseToken: 'synthetic/purchase-token',
  actorId,
  expectedAccountId: 'server-account',
};

describe('Play server adapter, network boundary mocked', () => {
  it('reads subscriptionsv2 with server credentials and server-bound account', async () => {
    const f = fixture();
    const result = await f.verifier.verify(request);
    expect(result).toMatchObject({
      kind: 'verified',
      subscription: {
        profile: 'plus',
        actorId,
        access: 'active',
        acknowledgement: 'pending',
      },
    });
    expect(f.fetch).toHaveBeenCalledOnce();
    expect(f.fetch.mock.calls[0]?.[0]).toContain(
      '/purchases/subscriptionsv2/tokens/synthetic%2Fpurchase-token'
    );
    expect(f.fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      headers: {
        authorization: 'Bearer synthetic-server-credential',
      },
    });
    expect(f.fetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    {
      externalAccountIdentifiers: {
        obfuscatedExternalAccountId: 'another-account',
      },
    },
    { testPurchase: {} },
    {
      lineItems: [
        {
          productId: 'another-product',
          expiryTime: '2026-12-16T10:00:00Z',
          offerDetails: { basePlanId: 'monthly' },
          autoRenewingPlan: { autoRenewEnabled: true },
        },
      ],
    },
  ])('rejects account, sandbox or catalog mismatch %j', async (overrides) => {
    expect(await fixture(evidence(overrides)).verifier.verify(request)).toEqual(
      { kind: 'rejected', category: 'identity_mismatch' }
    );
  });

  it.each([
    ['SUBSCRIPTION_STATE_ACTIVE', 'active'],
    ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'active'],
    ['SUBSCRIPTION_STATE_CANCELED', 'active'],
    ['SUBSCRIPTION_STATE_ON_HOLD', 'inactive'],
    ['SUBSCRIPTION_STATE_PAUSED', 'inactive'],
    ['SUBSCRIPTION_STATE_EXPIRED', 'inactive'],
    ['SUBSCRIPTION_STATE_PENDING', 'inactive'],
    ['SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', 'inactive'],
  ])('projects authoritative %s as %s', async (subscriptionState, access) => {
    expect(
      await fixture(evidence({ subscriptionState })).verifier.verify(request)
    ).toMatchObject({ kind: 'verified', subscription: { access } });
  });

  it('does not extend a canceled subscription beyond expiry', async () => {
    const body = evidence({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' });
    const item = body.lineItems[0];
    if (!item) throw new Error('Missing fixture item');
    item.expiryTime = '2026-11-15T10:00:00Z';
    expect(await fixture(body).verifier.verify(request)).toMatchObject({
      kind: 'verified',
      subscription: { access: 'inactive' },
    });
  });

  it('rejects multi-item/prepaid and malformed purchases rather than guessing', async () => {
    const body = evidence();
    expect(
      await fixture(
        evidence({ lineItems: [...body.lineItems, ...body.lineItems] })
      ).verifier.verify(request)
    ).toEqual({ kind: 'rejected', category: 'invalid_input' });
    expect(await fixture({}).verifier.verify(request)).toEqual({
      kind: 'rejected',
      category: 'invalid_input',
    });
  });

  it('does not retry or expose provider errors', async () => {
    const f = fixture();
    f.fetch.mockRejectedValue(new Error('sensitive provider detail'));
    expect(await f.verifier.verify(request)).toEqual({
      kind: 'rejected',
      category: 'unavailable',
    });
    expect(f.fetch).toHaveBeenCalledOnce();
  });

  it('acknowledges using the subscription endpoint only when explicitly called after commit', async () => {
    const f = fixture();
    const verified = await f.verifier.verify(request);
    if (verified.kind !== 'verified')
      throw new Error('fixture verification failed');
    expect(f.fetch).toHaveBeenCalledOnce();
    f.fetch.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await f.verifier.acknowledgeCommitted(verified.subscription)).toBe(
      true
    );
    expect(f.fetch.mock.calls[1]?.[0]).toContain(
      '/purchases/subscriptions/tuturuuu_plus/tokens/synthetic%2Fpurchase-token:acknowledge'
    );
  });
});
