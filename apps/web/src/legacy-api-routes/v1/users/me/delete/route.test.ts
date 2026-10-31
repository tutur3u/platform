import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  rpc: vi.fn(),
  deleteUser: vi.fn(),
  deleteWorkspace: vi.fn(),
  revoke: vi.fn(),
  revokeSeat: vi.fn(),
}));
vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: () => ({ subscriptions: { revoke: f.revoke } }),
}));
vi.mock('@tuturuuu/payment-core/polar-seat-helper', () => ({
  revokeSeatFromMember: f.revokeSeat,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    rpc: f.rpc,
    auth: { admin: { deleteUser: f.deleteUser } },
    from: () => ({ delete: () => ({ eq: f.deleteWorkspace }) }),
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
