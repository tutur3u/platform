import { NextRequest } from 'next/server';
import { expect, it, vi } from 'vitest';

const read = vi.hoisted(() =>
  vi.fn(async () => ({ data: [], pagination: {} }))
);
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({
    user: { id: 'staff', email: 'staff@tuturuuu.com' },
  }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
  createAdminClient: async () => ({}),
}));
vi.mock('@tuturuuu/supabase/next/user', () => ({
  getVerifiedAuthUser: async () => ({
    id: 'staff',
    email: 'staff@tuturuuu.com',
    email_confirmed_at: '2026-01-01',
    identities: [{ provider: 'email', identity_data: {} }],
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
  getPermissions: async () => ({
    containsPermission: () => false,
    withoutPermission: () => true,
  }),
}));
vi.mock('@/lib/time-tracking-helper', () => ({
  getGroupedSessionsPaginated: read,
}));
it('SR-270 denies root members without time-tracking management before exporting', async () => {
  const { GET } = await import('./route');
  expect(
    (await GET(new NextRequest('http://localhost/api/time-tracking/export')))
      .status
  ).toBe(403);
  expect(read).not.toHaveBeenCalled();
});

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
}));
