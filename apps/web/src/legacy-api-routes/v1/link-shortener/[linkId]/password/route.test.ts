import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  getPermissions: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
  getPermissions: mocks.getPermissions,
}));

import { DELETE, PATCH } from './route';

const WS_ID = '00000000-0000-4000-8000-000000000001';
const LINK_ID = '00000000-0000-4000-8000-000000000002';
const CREATOR_ID = '00000000-0000-4000-8000-000000000010';
const OTHER_USER_ID = '00000000-0000-4000-8000-000000000020';

function createMockAdmin(link: {
  id: string;
  ws_id: string;
  creator_id: string | null;
  password_hash: string | null;
}) {
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { ...link, password_hash: 'hashed' },
          error: null,
        }),
      }),
      then: (resolve: (value: { error: null }) => void) =>
        resolve({ error: null }),
    }),
  });

  return {
    sbAdmin: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: link, error: null }),
            }),
          }),
        }),
        update: updateMock,
      }),
    },
    updateMock,
  };
}

describe('link-shortener [linkId]/password least-privilege authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({});
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      ok: true,
      membershipType: 'member',
    });
  });

  it('rejects PATCH with 403 when non-creator without manage_workspace_settings tries to set initial password', async () => {
    const { sbAdmin, updateMock } = createMockAdmin({
      id: LINK_ID,
      ws_id: WS_ID,
      creator_id: CREATOR_ID,
      password_hash: null,
    });
    mocks.createAdminClient.mockResolvedValue(sbAdmin);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: OTHER_USER_ID },
    });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => false,
    });

    const response = await PATCH(
      new NextRequest(
        `http://localhost/api/v1/link-shortener/${LINK_ID}/password`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword: 'secret-password' }),
        }
      ),
      { params: Promise.resolve({ linkId: LINK_ID }) }
    );

    expect(response.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('allows PATCH when caller is the link creator', async () => {
    const { sbAdmin, updateMock } = createMockAdmin({
      id: LINK_ID,
      ws_id: WS_ID,
      creator_id: CREATOR_ID,
      password_hash: null,
    });
    mocks.createAdminClient.mockResolvedValue(sbAdmin);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: CREATOR_ID },
    });

    const response = await PATCH(
      new NextRequest(
        `http://localhost/api/v1/link-shortener/${LINK_ID}/password`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword: 'secret-password' }),
        }
      ),
      { params: Promise.resolve({ linkId: LINK_ID }) }
    );

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });

  it('allows PATCH when non-creator holds manage_workspace_settings', async () => {
    const { sbAdmin, updateMock } = createMockAdmin({
      id: LINK_ID,
      ws_id: WS_ID,
      creator_id: CREATOR_ID,
      password_hash: null,
    });
    mocks.createAdminClient.mockResolvedValue(sbAdmin);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: OTHER_USER_ID },
    });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (perm: string) =>
        perm === 'manage_workspace_settings',
    });

    const response = await PATCH(
      new NextRequest(
        `http://localhost/api/v1/link-shortener/${LINK_ID}/password`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword: 'secret-password' }),
        }
      ),
      { params: Promise.resolve({ linkId: LINK_ID }) }
    );

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it('rejects DELETE with 403 when caller is neither creator nor workspace manager', async () => {
    const { sbAdmin, updateMock } = createMockAdmin({
      id: LINK_ID,
      ws_id: WS_ID,
      creator_id: CREATOR_ID,
      password_hash: null,
    });
    mocks.createAdminClient.mockResolvedValue(sbAdmin);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: OTHER_USER_ID },
    });
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => false,
    });

    const response = await DELETE(
      new NextRequest(
        `http://localhost/api/v1/link-shortener/${LINK_ID}/password`,
        { method: 'DELETE' }
      ),
      { params: Promise.resolve({ linkId: LINK_ID }) }
    );

    expect(response.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
