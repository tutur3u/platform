import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  rpc: vi.fn(),
  guardRpc: vi.fn(),
  privateRpc: vi.fn(),
  deleteUser: vi.fn(),
  getUserById: vi.fn(),
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
    auth: { admin: { deleteUser: f.deleteUser, getUserById: f.getUserById } },
    from: () => ({ delete: () => ({ eq: f.deleteWorkspace }) }),
    schema: () => ({
      rpc: (name: string, args: unknown) =>
        name === 'account_deletion_blocking_workspaces'
          ? f.guardRpc(name, args)
          : name === 'delete_workspace_erasing_mira'
            ? f.deleteWorkspace(args)
            : f.privateRpc(name, args),
    }),
  }),
}));
const erasure = vi.hoisted(() => ({
  withWorkspace: vi.fn(),
  prepareSubject: vi.fn(),
  record: vi.fn(),
  settle: vi.fn(),
  release: vi.fn(),
}));
vi.mock('@tuturuuu/realtime/meet', () => ({
  meetClassAttendanceEnabled: () => true,
}));
vi.mock('@tuturuuu/meet-core/features/call/server/attendance-erasure', () => ({
  withWorkspaceAttendanceErasure: (...args: unknown[]) =>
    erasure.withWorkspace(...args),
  prepareSubjectAttendanceErasure: (...args: unknown[]) =>
    erasure.prepareSubject(...args),
  recordAttendanceErasure: (...args: unknown[]) => erasure.record(...args),
  settleAttendanceErasure: (...args: unknown[]) => erasure.settle(...args),
  releaseAttendanceErasure: (...args: unknown[]) => erasure.release(...args),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (req: Request, context: unknown) => Promise<Response>) =>
    (req: Request) =>
      handler(req, {
        user: { id: 'session-user' },
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

import { GET, POST } from './route';

const row = {
  ws_id: 'solo-workspace',
  ws_name: 'Solo',
  ws_personal: false,
  subscription_tier: 'FREE',
  member_count: 1,
  polar_subscription_id: 'subscription',
  pricing_model: null,
};
const blocking = [{ ws_id: 'team-workspace', ws_name: 'Team' }];
const request = (body: Record<string, unknown> = {}) =>
  new Request('https://example.test/delete', {
    method: 'POST',
    body: JSON.stringify({ email: 'user@example.test', ...body }),
  });

function expectNoAccountDeletion() {
  expect(erasure.record).not.toHaveBeenCalled();
  expect(f.deleteUser).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  f.rpc.mockResolvedValue({ data: [row], error: null });
  f.guardRpc.mockResolvedValue({ data: [], error: null });
  f.privateRpc.mockResolvedValue({ data: 'deleted', error: null });
  f.deleteUser.mockResolvedValue({ error: null });
  f.getUserById.mockResolvedValue({
    data: { user: null },
    error: { status: 404, message: 'not found' },
  });
  f.deleteWorkspace.mockResolvedValue({ data: 'deleted', error: null });
  f.revoke.mockResolvedValue({});
  f.revokeSeat.mockResolvedValue(undefined);
  erasure.withWorkspace.mockImplementation(
    async (_wsId: unknown, remove: unknown) => {
      const removed = await (remove as () => Promise<{ error?: unknown }>)();
      if (removed?.error) throw removed.error;
    }
  );
  erasure.prepareSubject.mockResolvedValue({
    rooms: [],
    sql: { op: 'subject', userId: 'session-user' },
  });
  erasure.record.mockResolvedValue(undefined);
  erasure.settle.mockResolvedValue(undefined);
  erasure.release.mockResolvedValue(undefined);
});

describe('account deletion last member-manager guard', () => {
  it('refuses a last manager with the workspace list before any side effect', async () => {
    f.guardRpc.mockResolvedValue({ data: blocking, error: null });

    const response = await POST(request() as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: 'ACCOUNT_DELETION_LAST_MANAGER',
      message:
        'Give another member member-management access, or delete the workspace first',
      workspaces: [{ id: 'team-workspace', name: 'Team' }],
    });
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.revoke).not.toHaveBeenCalled();
    expect(f.revokeSeat).not.toHaveBeenCalled();
    expect(f.deleteWorkspace).not.toHaveBeenCalled();
    expectNoAccountDeletion();
  });

  it('checks the session user and ignores actor ids in the body', async () => {
    f.guardRpc.mockResolvedValue({ data: blocking, error: null });

    await POST(
      request({ userId: 'other-user', p_actor_id: 'other-user' }) as never
    );

    expect(f.guardRpc).toHaveBeenCalledWith(
      'account_deletion_blocking_workspaces',
      { p_actor_id: 'session-user' }
    );
  });

  it('re-checks right before the Auth deletion and refuses a late last manager', async () => {
    f.guardRpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: blocking, error: null });

    const response = await POST(request() as never);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'ACCOUNT_DELETION_LAST_MANAGER',
      workspaces: [{ id: 'team-workspace', name: 'Team' }],
    });
    expect(f.guardRpc).toHaveBeenCalledTimes(2);
    expect(f.deleteWorkspace).toHaveBeenCalledOnce();
    expectNoAccountDeletion();
  });

  it('deletes the account when no workspace blocks it', async () => {
    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    expect(f.guardRpc).toHaveBeenCalledTimes(2);
    expect(f.revoke).toHaveBeenCalledOnce();
    expect(f.deleteWorkspace).toHaveBeenCalledOnce();
    expect(f.deleteUser).toHaveBeenCalledWith('session-user');
  });

  it.each([
    ['first', 0],
    ['second', 1],
  ])(
    'fails closed when the %s guard lookup errors',
    async (_label, failingCall) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      for (let call = 0; call < 2; call += 1) {
        f.guardRpc.mockResolvedValueOnce(
          call === failingCall
            ? { data: null, error: { message: 'guard failure' } }
            : { data: [], error: null }
        );
      }
      try {
        const response = await POST(request() as never);

        expect(response.status).toBe(500);
        expect(log).toHaveBeenCalledWith(
          'Account deletion manager guard failed:',
          expect.anything()
        );
        if (failingCall === 0) {
          expect(f.rpc).not.toHaveBeenCalled();
          expect(f.deleteWorkspace).not.toHaveBeenCalled();
        }
        expectNoAccountDeletion();
      } finally {
        log.mockRestore();
      }
    }
  );

  it('reports last-manager workspaces from the pre-check', async () => {
    f.guardRpc.mockResolvedValue({ data: blocking, error: null });

    const response = await GET(
      new Request('https://example.test/delete') as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      canDelete: false,
      lastManagerWorkspaces: [{ id: 'team-workspace', name: 'Team' }],
    });
    expect(f.guardRpc).toHaveBeenCalledWith(
      'account_deletion_blocking_workspaces',
      { p_actor_id: 'session-user' }
    );
  });

  it('fails the pre-check closed when the guard lookup errors', async () => {
    f.guardRpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await GET(
        new Request('https://example.test/delete') as never
      );
      expect(response.status).toBe(500);
    } finally {
      log.mockRestore();
    }
  });
});
