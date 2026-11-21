import { describe, expect, it, vi } from 'vitest';
import { createPlayRtdnProcessor, type PlayRtdnPolicy } from './play-rtdn';
import type { VerifiedPlaySubscription } from './play-server-verifier';

const now = Date.parse('2026-11-16T10:00:00Z');
const policy: PlayRtdnPolicy = {
  packageName: 'com.tuturuuu.app.mobile',
  audience: 'https://billing.example.test/play',
  pushSubscription: 'projects/test/subscriptions/play-rtdn',
  serviceAccountEmail: 'push@test.iam.gserviceaccount.com',
  serviceAccountSubject: '123456',
};
const actorId = '00000000-0000-4000-8000-000000000001';
const subscription: VerifiedPlaySubscription = {
  actorId,
  accountId: 'server-account',
  purchaseToken: 'synthetic-token',
  packageName: policy.packageName,
  environment: 'production',
  linkedPurchaseToken: null,
  profile: 'plus',
  productId: 'tuturuuu_plus',
  basePlanId: 'monthly',
  state: 'SUBSCRIPTION_STATE_ACTIVE',
  expiresAt: now + 1000,
  access: 'active',
  acknowledgement: 'pending',
};
function claims(overrides: Record<string, unknown> = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: policy.audience,
    sub: policy.serviceAccountSubject,
    email: policy.serviceAccountEmail,
    email_verified: true,
    iat: now / 1000 - 1,
    exp: now / 1000 + 100,
    ...overrides,
  };
}
function notification(overrides: Record<string, unknown> = {}) {
  return {
    version: '1.0',
    packageName: policy.packageName,
    eventTimeMillis: String(now - 100),
    subscriptionNotification: {
      version: '1.0',
      notificationType: 2,
      purchaseToken: 'synthetic-token',
    },
    ...overrides,
  };
}
function request(
  value: unknown = notification(),
  headers: Record<string, string> = {}
) {
  return new Request(policy.audience, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer eyJh.e30.c2ln',
      ...headers,
    },
    body: JSON.stringify({
      subscription: policy.pushSubscription,
      message: {
        messageId: 'message-1',
        publishTime: new Date(now).toISOString(),
        data: btoa(JSON.stringify(value)),
      },
    }),
  });
}
function fixture() {
  const order: string[] = [];
  const oidc = { verify: vi.fn().mockResolvedValue(claims()) };
  const repository = {
    resolveOwner: vi
      .fn()
      .mockResolvedValue({ actorId, accountId: 'server-account' }),
    reconcile: vi.fn().mockImplementation(async () => {
      order.push('commit');
      return { kind: 'committed', acknowledgement: subscription };
    }),
  };
  const subscriptions = {
    verify: vi.fn().mockResolvedValue({ kind: 'verified', subscription }),
    acknowledgeCommitted: vi.fn().mockImplementation(async () => {
      order.push('ack');
      return true;
    }),
  };
  return {
    oidc,
    repository,
    subscriptions,
    order,
    process: createPlayRtdnProcessor(policy, {
      oidc,
      repository,
      subscriptions,
      now: () => now,
    }),
  };
}

describe('Play RTDN policy, OIDC/network/repository boundaries mocked', () => {
  it('reconciles from Play API, commits, then acknowledges', async () => {
    const f = fixture();
    expect(await f.process(request())).toEqual({
      kind: 'accepted',
      disposition: 'committed',
    });
    expect(f.order).toEqual(['commit', 'ack']);
    expect(f.subscriptions.verify).toHaveBeenCalledWith({
      purchaseToken: 'synthetic-token',
      actorId,
      expectedAccountId: 'server-account',
    });
  });

  it.each([
    { aud: 'another-audience' },
    { email: 'another@test.iam.gserviceaccount.com' },
    { sub: 'another-identity' },
    { email_verified: false },
    { exp: now / 1000 - 1 },
    { iss: 'https://attacker.example' },
  ])(
    'rejects push identity mismatch %j before repository access',
    async (overrides) => {
      const f = fixture();
      f.oidc.verify.mockResolvedValue(claims(overrides));
      expect(await f.process(request())).toMatchObject({
        kind: 'rejected',
        status: 401,
      });
      expect(f.repository.resolveOwner).not.toHaveBeenCalled();
    }
  );

  it('rejects cryptographic verifier failure', async () => {
    const f = fixture();
    f.oidc.verify.mockRejectedValue(new Error('forged signature'));
    expect(await f.process(request())).toMatchObject({
      kind: 'rejected',
      status: 401,
    });
  });

  it('retries an unknown purchase owner without assigning an actor', async () => {
    const f = fixture();
    f.repository.resolveOwner.mockResolvedValue(null);
    expect(await f.process(request())).toMatchObject({
      kind: 'rejected',
      status: 503,
    });
    expect(f.subscriptions.verify).not.toHaveBeenCalled();
  });

  it('does not acknowledge a failed atomic commit', async () => {
    const f = fixture();
    f.repository.reconcile.mockRejectedValue(new Error('rollback'));
    expect(await f.process(request())).toMatchObject({
      kind: 'rejected',
      status: 503,
    });
    expect(f.subscriptions.acknowledgeCommitted).not.toHaveBeenCalled();
  });

  it('retries acknowledgement after a duplicate committed notification', async () => {
    const f = fixture();
    f.repository.reconcile.mockResolvedValue({
      kind: 'duplicate',
      acknowledgement: subscription,
    });
    f.subscriptions.acknowledgeCommitted.mockResolvedValue(false);
    expect(await f.process(request())).toMatchObject({
      kind: 'rejected',
      status: 503,
    });
    f.subscriptions.acknowledgeCommitted.mockResolvedValue(true);
    expect(await f.process(request())).toEqual({
      kind: 'accepted',
      disposition: 'duplicate',
    });
  });

  it('does not trust notification type as an entitlement', async () => {
    const f = fixture();
    f.subscriptions.verify.mockResolvedValue({
      kind: 'verified',
      subscription: {
        ...subscription,
        state: 'SUBSCRIPTION_STATE_EXPIRED',
        access: 'inactive',
      },
    });
    f.repository.reconcile.mockResolvedValue({
      kind: 'committed',
      acknowledgement: null,
    });
    expect(await f.process(request())).toMatchObject({ kind: 'accepted' });
    expect(f.repository.reconcile.mock.calls[0]?.[0].subscription.access).toBe(
      'inactive'
    );
    expect(f.subscriptions.acknowledgeCommitted).not.toHaveBeenCalled();
  });

  it('accepts unknown top-level fields from Google', async () => {
    const f = fixture();
    expect(
      await f.process(request(notification({ futureField: { a: 1 } })))
    ).toEqual({ kind: 'accepted', disposition: 'committed' });
  });

  it.each([
    {
      subscriptionNotification: undefined,
      oneTimeProductNotification: {
        version: '1.0',
        notificationType: 1,
        purchaseToken: 'synthetic-token',
        sku: 'credits',
      },
    },
    {
      subscriptionNotification: undefined,
      voidedPurchaseNotification: {
        purchaseToken: 'synthetic-token',
        productType: 2,
        orderId: 'GPA.1',
      },
    },
  ])(
    'acknowledges and ignores non-subscription kinds %#',
    async (overrides) => {
      const f = fixture();
      expect(await f.process(request(notification(overrides)))).toEqual({
        kind: 'accepted',
        disposition: 'ignored',
      });
      expect(f.repository.resolveOwner).not.toHaveBeenCalled();
      expect(f.repository.reconcile).not.toHaveBeenCalled();
    }
  );

  it('checks authentication and package before ignoring a non-subscription kind', async () => {
    const ignored = notification({
      subscriptionNotification: undefined,
      voidedPurchaseNotification: {
        purchaseToken: 'synthetic-token',
        productType: 2,
        orderId: 'GPA.1',
      },
    });
    const f = fixture();
    f.oidc.verify.mockRejectedValueOnce(new Error('bad signature'));
    expect(await f.process(request(ignored))).toMatchObject({
      kind: 'rejected',
      status: 401,
    });
    expect(
      await f.process(request({ ...ignored, packageName: 'another.app' }))
    ).toMatchObject({ kind: 'rejected', status: 400 });
  });

  it('reconciles a voided subscription purchase', async () => {
    const f = fixture();
    expect(
      await f.process(
        request(
          notification({
            subscriptionNotification: undefined,
            voidedPurchaseNotification: {
              purchaseToken: 'synthetic-token',
              productType: 1,
              orderId: 'GPA.1',
            },
          })
        )
      )
    ).toMatchObject({ kind: 'accepted', disposition: 'committed' });
    expect(f.repository.reconcile).toHaveBeenCalledOnce();
  });

  it('rejects a notification carrying two kinds', async () => {
    const f = fixture();
    expect(
      await f.process(
        request(notification({ testNotification: { version: '1.0' } }))
      )
    ).toMatchObject({ kind: 'rejected', status: 400 });
  });

  it('enforces input limits and package boundary', async () => {
    const f = fixture();
    expect(
      await f.process(request(notification(), { 'content-type': 'text/plain' }))
    ).toMatchObject({ kind: 'rejected', status: 415 });
    expect(
      await f.process(request(notification(), { 'content-length': '999999' }))
    ).toMatchObject({ kind: 'rejected', status: 413 });
    expect(
      await f.process(request(notification({ packageName: 'another.app' })))
    ).toMatchObject({ kind: 'rejected', status: 400 });
    expect(f.repository.reconcile).not.toHaveBeenCalled();
  });
});
