import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
}));

import { GET } from './route';

function permissions(permissionIds: string[]) {
  const permissionSet = new Set(permissionIds);

  return {
    containsPermission: vi.fn((permission: string) =>
      permissionSet.has(permission)
    ),
  };
}

describe('post permissions route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not expose post approval controls for send-email-only users', async () => {
    mocks.getPermissions
      .mockResolvedValueOnce(permissions(['send_user_group_post_emails']))
      .mockResolvedValueOnce(permissions([]));

    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/posts/permissions'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      canApprovePosts: false,
      canForceSendPosts: false,
    });
  });

  it('exposes post approval controls for approve_posts users', async () => {
    mocks.getPermissions
      .mockResolvedValueOnce(permissions(['approve_posts']))
      .mockResolvedValueOnce(permissions([]));

    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/posts/permissions'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      canApprovePosts: true,
      canForceSendPosts: false,
    });
  });
});
