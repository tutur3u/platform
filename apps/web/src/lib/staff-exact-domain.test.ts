// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const f = vi.hoisted(() => ({
  resolve: vi.fn(),
  getUserById: vi.fn(),
  token: vi.fn(),
  sessions: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: f.resolve,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
  createAdminClient: async () => ({
    auth: { admin: { getUserById: f.getUserById } },
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async (wsId: string) => wsId,
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
}));
vi.mock('@/lib/live/token-builder', () => ({
  createConstrainedLiveToken: f.token,
}));
vi.mock('@/lib/time-tracking-helper', () => ({
  getGroupedSessionsPaginated: f.sessions,
}));
vi.mock('next/server', async () => ({
  ...(await vi.importActual<object>('next/server')),
  connection: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { GET as exportSessions } from '@/legacy-api-routes/time-tracking/export/route';
import { POST as miraToken } from '@/legacy-api-routes/v1/mira/token/route';

const user = (email: string) => ({
  id: 'actor',
  email,
  email_confirmed_at: '2026-01-01',
  identities: [{ provider: 'email', identity_data: {} }],
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe('exact @tuturuuu.com staff gates', () => {
  it.each([
    [
      'Mira token',
      () =>
        miraToken(
          new Request('https://app.test/api/v1/mira/token', {
            method: 'POST',
            body: JSON.stringify({ wsId: 'workspace' }),
          })
        ),
    ],
    [
      'time-tracking export',
      () =>
        exportSessions(
          new NextRequest('https://app.test/api/time-tracking/export')
        ),
    ],
  ] as const)('%s denies a verified xwf account', async (_name, handler) => {
    const xwf = user('staff@xwf.tuturuuu.com');
    f.resolve.mockResolvedValue({ user: xwf, authError: null });
    f.getUserById.mockResolvedValue({ data: { user: xwf }, error: null });
    const response = await handler();
    expect(response.status).toBe(403);
    expect(f.token).not.toHaveBeenCalled();
    expect(f.sessions).not.toHaveBeenCalled();
  });

  it('issues a Mira token to a verified exact-domain account', async () => {
    f.resolve.mockResolvedValue({
      user: user('staff@tuturuuu.com'),
      authError: null,
    });
    f.token.mockResolvedValue({ name: 'token' });
    const response = await miraToken(
      new Request('https://app.test/api/v1/mira/token', {
        method: 'POST',
        body: JSON.stringify({ wsId: 'workspace' }),
      })
    );
    expect(response.status).not.toBe(403);
    expect(f.token).toHaveBeenCalledOnce();
  });
});
