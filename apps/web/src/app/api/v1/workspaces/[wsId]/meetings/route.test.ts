import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  normalize: vi.fn(),
  membership: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.auth }));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalize,
  verifyWorkspaceMembershipType: mocks.membership,
}));

import { POST } from './route';

const params = { params: Promise.resolve({ wsId: 'personal' }) };
function request() {
  return new NextRequest(
    'https://example.test/api/v1/workspaces/personal/meetings',
    {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test',
        time: '2026-09-06T10:00:00Z',
        creator_id: 'forged',
      }),
    }
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.normalize.mockResolvedValue('workspace-id');
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.insert.mockReturnValue({
    select: () => ({
      single: async () => ({ data: { id: 'meeting-id' }, error: null }),
    }),
  });
});
describe('meeting creation authorization', () => {
  it.each(['external@gmail.com', 'host@tuturuuu.com.attacker.test', undefined])(
    'denies %s before accessing database',
    async (email) => {
      mocks.auth.mockResolvedValue({
        ok: true,
        user: {
          id: 'actor',
          email,
          user_metadata: { email: 'spoof@tuturuuu.com' },
        },
        supabase: { from: mocks.from },
      });
      const response = await POST(request(), params);
      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('MEET_CREATION_RESTRICTED');
      expect(mocks.from).not.toHaveBeenCalled();
    }
  );
  it('allows an authenticated company account and stamps its actor', async () => {
    mocks.auth.mockResolvedValue({
      ok: true,
      user: { id: 'actor', email: 'Host@TUTURUUU.COM' },
      supabase: { from: mocks.from },
    });
    expect((await POST(request(), params)).status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ creator_id: 'actor', ws_id: 'workspace-id' })
    );
  });
  it('still requires workspace membership for company accounts', async () => {
    mocks.auth.mockResolvedValue({
      ok: true,
      user: { id: 'actor', email: 'host@tuturuuu.com' },
      supabase: { from: mocks.from },
    });
    mocks.membership.mockResolvedValue({ ok: false });
    expect((await POST(request(), params)).status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('preserves unauthenticated rejection', async () => {
    mocks.auth.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    });
    expect((await POST(request(), params)).status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
