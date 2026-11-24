import {
  AlreadyCanceledSubscription,
  PolarError,
} from '@tuturuuu/payment/polar/errors';
import { WORKSPACE_DELETION_REVOKE_COMMENT } from '@tuturuuu/payment-core/subscription-constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: () => {
    throw new Error('default Polar client must not be used in tests');
  },
}));

import {
  readWorkspaceDeletionEligibility,
  revokeWorkspaceSubscriptionsForDeletion,
} from './workspace-deletion-billing';

const ACTOR = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const WORKSPACE = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const FREE = { id: 'prod_free', pricing_model: 'free', price: null };
const PAID = { id: 'prod_paid', pricing_model: 'fixed', price: 900 };

type Row = { polar_subscription_id: string | null; product_id: string | null };

function adminWith({
  secrets = { data: [] as { value: string }[], error: null },
  billing = { data: false as boolean | null, error: null },
  subscriptions = { data: [] as Row[], error: null as { code: string } | null },
  products = {
    data: [FREE, PAID] as (typeof FREE | typeof PAID)[],
    error: null as { code: string } | null,
  },
} = {}) {
  const neq = vi.fn().mockResolvedValue(subscriptions);
  const statusIn = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq: vi.fn(() => ({ in: statusIn })) }));
  const from = vi.fn((table: string) =>
    table === 'workspace_subscriptions'
      ? { select: vi.fn(() => ({ eq: vi.fn(() => ({ neq })) })), update }
      : {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ eq: vi.fn().mockResolvedValue(secrets) })),
          })),
        }
  );
  const productIn = vi.fn().mockResolvedValue(products);
  const rpc = vi.fn().mockResolvedValue(billing);
  const schema = vi.fn(() => ({
    rpc,
    from: vi.fn(() => ({ select: vi.fn(() => ({ in: productIn })) })),
  }));
  return { admin: { from, schema } as never, neq, update, statusIn, rpc };
}

type Get = (request: { id: string }) => Promise<{
  amount: number;
  status: string;
}>;
type Update = (request: unknown) => Promise<unknown>;

function polarWith({
  get = vi.fn().mockResolvedValue({ amount: 0, status: 'active' }),
  update = vi.fn().mockResolvedValue({}),
}: {
  get?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
} = {}) {
  const factory = vi.fn(() => ({
    subscriptions: { get: get as Get, update: update as Update },
  }));
  return { factory, get, update };
}

const freeRow = (id: string): Row => ({
  polar_subscription_id: id,
  product_id: FREE.id,
});
const input = (admin: never) => ({
  admin,
  actorId: ACTOR,
  workspaceId: WORKSPACE,
});

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('readWorkspaceDeletionEligibility', () => {
  it.each([
    [{}, 'ready'],
    [{ billing: { data: true, error: null } }, 'subscription_active'],
    [
      {
        secrets: { data: [{ value: ' TRUE ' }], error: null },
        billing: { data: true, error: null },
      },
      'protected',
    ],
    [{ billing: { data: null, error: null } }, 'failed'],
    [{ billing: { data: false, error: { code: 'XX000' } } }, 'failed'],
  ])('maps %j to %s', async (state, expected) => {
    const { admin } = adminWith(state as never);
    await expect(
      readWorkspaceDeletionEligibility(admin, WORKSPACE)
    ).resolves.toBe(expected);
  });
});

describe('revokeWorkspaceSubscriptionsForDeletion', () => {
  it('skips Polar when the workspace has no live subscription', async () => {
    const { admin, neq } = adminWith();
    const polar = polarWith();
    await expect(
      revokeWorkspaceSubscriptionsForDeletion(input(admin), polar.factory)
    ).resolves.toBe('revoked');
    expect(neq).toHaveBeenCalledWith('status', 'canceled');
    expect(polar.factory).not.toHaveBeenCalled();
  });

  it('revokes a free subscription once with the deletion marker and audit', async () => {
    const { admin, statusIn } = adminWith({
      subscriptions: {
        data: [
          freeRow('sub_free'),
          freeRow('sub_free'),
          { polar_subscription_id: null, product_id: FREE.id },
        ],
        error: null,
      },
    });
    const polar = polarWith();
    await expect(
      revokeWorkspaceSubscriptionsForDeletion(input(admin), polar.factory)
    ).resolves.toBe('revoked');
    expect(polar.update).toHaveBeenCalledExactlyOnceWith({
      id: 'sub_free',
      subscriptionUpdate: {
        revoke: true,
        customerCancellationComment: WORKSPACE_DELETION_REVOKE_COMMENT,
      },
    });
    expect(statusIn).toHaveBeenCalledWith('polar_subscription_id', [
      'sub_free',
    ]);
    expect(console.info).toHaveBeenCalledWith(
      '[audit] workspace.billing.revoke',
      {
        action: 'workspace.billing.revoke',
        actorId: ACTOR,
        workspaceId: WORKSPACE,
        subscriptionId: 'sub_free',
        outcome: 'revoked',
        trigger: 'workspace.delete',
      }
    );
  });

  it.each([
    [
      'a paid catalog product',
      [{ polar_subscription_id: 'sub', product_id: PAID.id }],
    ],
    [
      'an unknown product',
      [{ polar_subscription_id: 'sub', product_id: 'gone' }],
    ],
    [
      'a missing product id',
      [{ polar_subscription_id: 'sub', product_id: null }],
    ],
  ])('never revokes %s', async (_label, rows) => {
    const { admin, update } = adminWith({
      subscriptions: { data: rows, error: null },
    });
    const polar = polarWith();
    await expect(
      revokeWorkspaceSubscriptionsForDeletion(input(admin), polar.factory)
    ).resolves.toBe('subscription_active');
    expect(polar.factory).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps every plan when Polar reports a paid amount on any of them', async () => {
    const { admin, update } = adminWith({
      subscriptions: {
        data: [freeRow('sub_a'), freeRow('sub_b')],
        error: null,
      },
    });
    const get = vi
      .fn()
      .mockResolvedValueOnce({ amount: 0, status: 'active' })
      .mockResolvedValueOnce({ amount: 900, status: 'active' });
    const polar = polarWith({ get });
    await expect(
      revokeWorkspaceSubscriptionsForDeletion(input(admin), polar.factory)
    ).resolves.toBe('subscription_active');
    expect(polar.update).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    [
      'already canceled on revoke',
      'update',
      Object.create(AlreadyCanceledSubscription.prototype),
    ],
    [
      'missing on read',
      'get',
      Object.assign(Object.create(PolarError.prototype), { statusCode: 404 }),
    ],
  ])(
    'treats a subscription %s as ended so retries are safe',
    async (_label, step, error) => {
      const { admin } = adminWith({
        subscriptions: { data: [freeRow('sub_done')], error: null },
      });
      const polar = polarWith(
        step === 'get'
          ? { get: vi.fn().mockRejectedValue(error) }
          : { update: vi.fn().mockRejectedValue(error) }
      );
      await expect(
        revokeWorkspaceSubscriptionsForDeletion(input(admin), polar.factory)
      ).resolves.toBe('revoked');
      expect(console.info).toHaveBeenCalledWith(
        '[audit] workspace.billing.revoke',
        expect.objectContaining({ outcome: 'already_ended' })
      );
    }
  );

  it.each([Number.NaN, undefined, '0', -1])(
    'fails closed on a malformed Polar amount (%j)',
    async (amount) => {
      const { admin } = adminWith({
        subscriptions: { data: [freeRow('sub_free')], error: null },
      });
      const polar = polarWith({
        get: vi.fn().mockResolvedValue({ amount, status: 'active' }),
      });
      await expect(
        revokeWorkspaceSubscriptionsForDeletion(input(admin), polar.factory)
      ).resolves.toBe('subscription_active');
      expect(polar.update).not.toHaveBeenCalled();
    }
  );

  it('keeps a plan upgraded between verification and its revocation', async () => {
    const { admin } = adminWith({
      subscriptions: { data: [freeRow('sub_free')], error: null },
    });
    const get = vi
      .fn()
      .mockResolvedValueOnce({ amount: 0, status: 'active' })
      .mockResolvedValueOnce({ amount: 900, status: 'active' });
    const polar = polarWith({ get });
    await expect(
      revokeWorkspaceSubscriptionsForDeletion(input(admin), polar.factory)
    ).resolves.toBe('subscription_active');
    expect(get).toHaveBeenCalledTimes(2);
    expect(polar.update).not.toHaveBeenCalled();
  });

  it('records a partial revocation and completes it on retry', async () => {
    const rows = [freeRow('sub_a'), freeRow('sub_b')];
    const first = adminWith({ subscriptions: { data: rows, error: null } });
    const update = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('polar down'));
    await expect(
      revokeWorkspaceSubscriptionsForDeletion(
        input(first.admin),
        polarWith({ update }).factory
      )
    ).resolves.toBe('billing_cancel_failed');
    expect(first.statusIn).toHaveBeenCalledWith('polar_subscription_id', [
      'sub_a',
    ]);

    const retry = adminWith({
      subscriptions: { data: [freeRow('sub_b')], error: null },
    });
    const retryPolar = polarWith();
    await expect(
      revokeWorkspaceSubscriptionsForDeletion(
        input(retry.admin),
        retryPolar.factory
      )
    ).resolves.toBe('revoked');
    expect(retryPolar.update).toHaveBeenCalledOnce();
  });

  it('treats a subscription Polar already ended as revoked without calling revoke', async () => {
    const { admin } = adminWith({
      subscriptions: { data: [freeRow('sub_done')], error: null },
    });
    const polar = polarWith({
      get: vi.fn().mockResolvedValue({ amount: 900, status: 'canceled' }),
    });
    await expect(
      revokeWorkspaceSubscriptionsForDeletion(input(admin), polar.factory)
    ).resolves.toBe('revoked');
    expect(polar.update).not.toHaveBeenCalled();
  });

  it('stops deletion when Polar fails, without logging provider details', async () => {
    const { admin, update } = adminWith({
      subscriptions: { data: [freeRow('sub_free')], error: null },
    });
    const polar = polarWith({
      update: vi.fn().mockRejectedValue(new Error('upstream secret detail')),
    });
    await expect(
      revokeWorkspaceSubscriptionsForDeletion(input(admin), polar.factory)
    ).resolves.toBe('billing_cancel_failed');
    expect(update).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith(
      '[audit] workspace.billing.revoke',
      expect.objectContaining({ outcome: 'failed' })
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(
      'secret'
    );
  });

  it('stops deletion when the Polar client cannot be created', async () => {
    const { admin } = adminWith({
      subscriptions: { data: [freeRow('sub_free')], error: null },
    });
    const factory = vi.fn(() => {
      throw new Error('missing token');
    });
    await expect(
      revokeWorkspaceSubscriptionsForDeletion(input(admin), factory)
    ).resolves.toBe('billing_cancel_failed');
  });

  it.each([
    ['subscription', { subscriptions: { data: [], error: { code: 'XX000' } } }],
    [
      'product',
      {
        subscriptions: { data: [freeRow('sub_free')], error: null },
        products: { data: [], error: { code: 'XX000' } },
      },
    ],
  ])('fails closed when the %s lookup fails', async (_label, state) => {
    const { admin } = adminWith(state as never);
    const polar = polarWith();
    await expect(
      revokeWorkspaceSubscriptionsForDeletion(input(admin), polar.factory)
    ).resolves.toBe('failed');
    expect(polar.factory).not.toHaveBeenCalled();
  });
});
