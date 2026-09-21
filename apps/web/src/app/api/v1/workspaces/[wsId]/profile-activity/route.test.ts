import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  getActivitySharing: vi.fn(),
  getSharedActivity: vi.fn(),
  listSharedProfiles: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => mocks);
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => mocks);
vi.mock('@tuturuuu/utils/workspace-helper', () => mocks);
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('@/lib/profile/workspace-activity', async (original) => ({
  ...(await original<typeof import('@/lib/profile/workspace-activity')>()),
  ...mocks,
}));

import { GET } from './route';

const params = { params: Promise.resolve({ wsId: 'workspace' }) };
const req = () =>
  new Request(
    'https://tuturuuu.com/api/v1/workspaces/workspace/profile-activity'
  );

describe('profile activity access boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'viewer' },
      authError: null,
    });
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace');
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { personal: false }, error: null }),
    };
    mocks.createClient.mockResolvedValue({
      from: vi.fn().mockReturnValue(query),
    });
    mocks.createAdminClient.mockResolvedValue({});
    mocks.getActivitySharing.mockResolvedValue(false);
    mocks.listSharedProfiles.mockResolvedValue({ members: [], next: null });
  });
  it('rejects unauthenticated viewers before privileged access', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({ user: null });
    expect((await GET(req(), params)).status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
  it.each([{ ok: false }, { ok: false, error: 'membership_lookup_failed' }])(
    'rejects missing or failed membership: %j',
    async (access) => {
      mocks.verifyWorkspaceMembershipType.mockResolvedValue(access);
      expect((await GET(req(), params)).status).toBe(access.error ? 500 : 403);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    }
  );
  it('does not expose personal workspace activity', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { personal: true }, error: null }),
    };
    mocks.createClient.mockResolvedValue({
      from: vi.fn().mockReturnValue(query),
    });
    expect((await GET(req(), params)).status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
  it('returns private defaults without shared caching', async () => {
    const response = await GET(req(), params);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      sharing: false,
      members: [],
      next: null,
    });
  });
  it('rejects invalid timezones before accessing the aggregate', async () => {
    const response = await GET(
      new Request(`${req().url}?timezone=invalid`),
      params
    );
    expect(response.status).toBe(400);
    expect(mocks.getSharedActivity).not.toHaveBeenCalled();
  });
});
