import { beforeEach, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => ({ imports: 0 }));
const f = vi.hoisted(() => ({
  rpc: vi.fn(),
  deleteUser: vi.fn(),
  deleteWorkspace: vi.fn(),
  revoke: vi.fn(),
  revokeSeat: vi.fn(),
}));

vi.mock('@tuturuuu/payment/polar/server', () => ({
  createPolarClient: () => ({
    subscriptions: { revoke: f.revoke },
    customers: { getExternal: vi.fn() },
    customerSeats: { listSeats: vi.fn(), revokeSeat: vi.fn() },
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
    }),
  }),
}));
vi.mock('@tuturuuu/realtime/meet', () => ({
  meetClassAttendanceEnabled: () => false,
}));
vi.mock('@tuturuuu/meet-core/features/call/server/attendance-erasure', () => {
  probe.imports += 1;
  throw new Error('missing migration');
});
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

beforeEach(() => {
  vi.clearAllMocks();
  f.rpc.mockResolvedValue({ data: [row], error: null });
  f.deleteUser.mockResolvedValue({ error: null });
  f.deleteWorkspace.mockResolvedValue({ error: null });
  f.revoke.mockResolvedValue({});
  f.revokeSeat.mockResolvedValue(undefined);
});

function request() {
  return new Request('https://example.test/delete', {
    method: 'POST',
    body: JSON.stringify({ email: 'user@example.test' }),
  });
}

it('deletes the account while attendance storage is unavailable', async () => {
  const response = await POST(request() as never);
  expect(response.status).toBe(200);
  expect(f.deleteWorkspace).toHaveBeenCalledOnce();
  expect(f.deleteUser).toHaveBeenCalledOnce();
  expect(probe.imports).toBe(0);
});

it('keeps a workspace delete error while attendance storage is unavailable', async () => {
  f.deleteWorkspace.mockResolvedValue({ error: { code: 'failure' } });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await POST(request() as never);
  expect(response.status).toBe(502);
  expect(f.deleteUser).not.toHaveBeenCalled();
  expect(probe.imports).toBe(0);
  log.mockRestore();
});
