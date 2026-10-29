import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  allowed: false,
  staff: true,
  admin: vi.fn(),
  remember: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    user: { id: 'staff', email: 'staff@tuturuuu.com' },
  }),
}));
vi.mock('@tuturuuu/utils/email/staff-session', () => ({
  isVerifiedTuturuuuStaffSession: () => mocks.staff,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({
    containsPermission: () => mocks.allowed,
    withoutPermission: () => !mocks.allowed,
  }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/ai/memory', () => ({
  resolveAiMemoryScope: (args: unknown) => args,
  rememberAiMemory: mocks.remember,
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = false;
  mocks.staff = true;
  const chain = {
    eq: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
    order: vi.fn(),
    range: async () => ({
      data: [
        {
          id: 'memory',
          user_id: 'opted-out-user',
          category: 'fact',
          key: 'key',
          value: 'fixture',
          updated_at: '2026-01-01',
        },
      ],
      error: null,
    }),
    maybeSingle: async () => ({ data: { id: 'personal-workspace' } }),
  };
  chain.eq.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  mocks.admin.mockResolvedValue({
    from: () => chain,
    schema: () => ({
      rpc: async () => ({ data: 'run', error: null }),
      from: () => chain,
    }),
  });
  mocks.remember.mockImplementation(
    async (args: { ignoreSettings?: boolean }) => ({
      ok: true,
      skipped: args.ignoreSettings !== true,
    })
  );
});
const req = () =>
  new NextRequest('http://localhost/api/backfill', {
    method: 'POST',
    body: '{}',
  });
it('SR-270 denies non-operators before reading legacy memories', async () => {
  const { POST } = await import('./route');
  expect((await POST(req())).status).toBe(403);
  expect(mocks.admin).not.toHaveBeenCalled();
});
it('SR-270 retains memory-service consent checks during an authorized backfill', async () => {
  mocks.allowed = true;
  const { POST } = await import('./route');
  const response = await POST(req());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ imported: 0, skipped: 1 });
  expect(mocks.remember).toHaveBeenCalledWith(
    expect.not.objectContaining({ ignoreSettings: true })
  );
});

it('denies an operator without a verified staff session before memory access', async () => {
  mocks.allowed = true;
  mocks.staff = false;
  const { POST } = await import('./route');
  expect((await POST(req())).status).toBe(403);
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.remember).not.toHaveBeenCalled();
});
