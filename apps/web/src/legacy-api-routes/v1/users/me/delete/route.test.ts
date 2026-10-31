import {
  AlreadyCanceledSubscription,
  PolarError,
} from '@tuturuuu/payment/polar/errors';
import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  rpc: vi.fn(),
  deleteUser: vi.fn(),
  deleteWorkspace: vi.fn(),
  revoke: vi.fn(),
  revokeSeat: vi.fn(),
  getExternal: vi.fn(),
  listSeats: vi.fn(),
  revokeProviderSeat: vi.fn(),
}));
vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: () => ({
    subscriptions: { revoke: f.revoke },
    customers: { getExternal: f.getExternal },
    customerSeats: { listSeats: f.listSeats, revokeSeat: f.revokeProviderSeat },
  }),
}));
vi.mock('@tuturuuu/payment-core/polar-seat-helper', () => ({
  revokeSeatFromMember: f.revokeSeat,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    rpc: f.rpc,
    auth: { admin: { deleteUser: f.deleteUser } },
    from: () => ({
      delete: () => ({ eq: f.deleteWorkspace }),
      select: () => ({
        eq: () => ({
          in: () => ({
            maybeSingle: async () => ({
              data: {
                product_id: 'product',
                polar_subscription_id: 'subscription',
              },
              error: null,
            }),
          }),
        }),
      }),
    }),
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { pricing_model: 'seat_based' },
              error: null,
            }),
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (req: Request, context: unknown) => Promise<Response>) =>
    (req: Request) =>
      handler(req, {
        user: { id: 'user' },
        supabase: {
          from: () => ({
            select: () => ({
              eq: () => ({
                single: async () => ({
                  data: { email: 'user@example.test' },
                  error: null,
                }),
              }),
            }),
          }),
        },
      }),
}));

import { POST } from './route';

const row = {
  ws_id: 'workspace',
  ws_name: 'Workspace',
  ws_personal: false,
  subscription_tier: 'FREE',
  member_count: 1,
  polar_subscription_id: null,
  pricing_model: null,
};
const request = () =>
  new Request('https://example.test/delete', {
    method: 'POST',
    body: JSON.stringify({ email: 'user@example.test' }),
  });

beforeEach(() => {
  vi.resetAllMocks();
  f.rpc.mockResolvedValue({ data: [row], error: null });
  f.deleteUser.mockResolvedValue({ error: null });
  f.deleteWorkspace.mockResolvedValue({ error: null });
  f.revoke.mockResolvedValue({});
  f.revokeSeat.mockResolvedValue(undefined);
});

it.each(['seat', 'subscription', 'workspace result', 'workspace throw'])(
  'stops account deletion when %s cleanup fails',
  async (failure) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    if (failure === 'seat') {
      f.rpc.mockResolvedValue({
        data: [{ ...row, member_count: 2 }],
        error: null,
      });
      f.revokeSeat.mockRejectedValue(new Error('seat failure'));
    } else if (failure === 'subscription') {
      f.rpc.mockResolvedValue({
        data: [{ ...row, polar_subscription_id: 'subscription' }],
        error: null,
      });
      f.revoke.mockRejectedValue(new Error('subscription failure'));
    } else if (failure === 'workspace result') {
      f.deleteWorkspace.mockResolvedValue({
        error: new Error('workspace failure'),
      });
    } else {
      f.deleteWorkspace.mockRejectedValue(new Error('workspace failure'));
    }
    const response = await POST(request() as never);
    expect(response.status).toBe(502);
    expect(f.deleteUser).not.toHaveBeenCalled();
    log.mockRestore();
  }
);

function providerError(status: number) {
  const meta = {
    response: new Response('', { status }),
    request: new Request('https://example.test'),
    body: '',
  };
  return status === 403
    ? new AlreadyCanceledSubscription(
        { error: 'AlreadyCanceledSubscription', detail: 'already canceled' },
        meta
      )
    : new PolarError('private provider detail', meta);
}

it.each([404, 403])(
  'continues account deletion after terminal subscription status %s',
  async (status) => {
    f.rpc.mockResolvedValue({
      data: [{ ...row, polar_subscription_id: 'subscription' }],
      error: null,
    });
    f.revoke.mockRejectedValue(providerError(status));
    const response = await POST(request() as never);
    expect(response.status).toBe(200);
    expect(f.deleteWorkspace).toHaveBeenCalledOnce();
    expect(f.deleteUser).toHaveBeenCalledOnce();
  }
);

it.each([providerError(503), new TypeError('network'), new Error('timeout')])(
  'aborts account deletion before any database deletion after a provider failure',
  async (error) => {
    f.rpc.mockResolvedValue({
      data: [{ ...row, polar_subscription_id: 'subscription' }],
      error: null,
    });
    f.revoke.mockRejectedValue(error);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await POST(request() as never);
      expect(response.status).toBe(502);
      expect(f.deleteWorkspace).not.toHaveBeenCalled();
      expect(f.deleteUser).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  }
);

it.each(['missing customer', 'revoked seat', '5xx', 'network', 'timeout'])(
  'runs real seat cleanup during account deletion: %s',
  async (state) => {
    const actual = await vi.importActual<
      typeof import('@tuturuuu/payment-core/polar-seat-helper')
    >('@tuturuuu/payment-core/polar-seat-helper');
    f.revokeSeat.mockImplementation(actual.revokeSeatFromMember);
    f.rpc.mockResolvedValue({
      data: [{ ...row, member_count: 2 }],
      error: null,
    });
    f.getExternal.mockResolvedValue({ id: 'customer' });
    f.listSeats.mockResolvedValue({
      seats: [{ id: 'seat', customerId: 'customer', status: 'revoked' }],
    });
    const failure =
      state === '5xx'
        ? providerError(503)
        : state === 'network'
          ? new TypeError('network')
          : new Error('timeout');
    if (state === 'missing customer')
      f.getExternal.mockRejectedValue(providerError(404));
    const succeeds = state === 'missing customer' || state === 'revoked seat';
    if (!succeeds) f.getExternal.mockRejectedValue(failure);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await POST(request() as never);
      expect(response.status).toBe(succeeds ? 200 : 502);
      expect(f.deleteWorkspace).not.toHaveBeenCalled();
      expect(f.deleteUser).toHaveBeenCalledTimes(succeeds ? 1 : 0);
      expect(f.revokeProviderSeat).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  }
);
