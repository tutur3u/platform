import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));
vi.mock('./workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

import { getWorkspaceUserLinkForUser } from './workspace-user-link';

describe('getWorkspaceUserLinkForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses an injected authorization client for satellite actors', async () => {
    const link = {
      created_at: '2026-07-13T00:00:00.000Z',
      platform_user_id: 'platform-user-1',
      virtual_user_id: 'virtual-user-1',
      ws_id: 'workspace-1',
    };
    const maybeSingle = vi.fn().mockResolvedValue({ data: link, error: null });
    const limit = vi.fn(() => ({ maybeSingle }));
    const secondEq = vi.fn(() => ({ limit }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));
    const authorizationClient = {
      from: vi.fn(() => ({ select })),
    } as unknown as TypedSupabaseClient;

    await expect(
      getWorkspaceUserLinkForUser('workspace-1', 'platform-user-1', {
        authorizationClient,
      })
    ).resolves.toEqual(link);

    expect(authorizationClient.from).toHaveBeenCalledWith(
      'workspace_user_linked_users'
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
