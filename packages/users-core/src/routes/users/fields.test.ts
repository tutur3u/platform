import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  order: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
}));

import { handleListWorkspaceUserFieldsRequest } from './fields';

const actor = { email: 'member@example.com', id: 'actor-1' };
const context = {
  params: Promise.resolve({ wsId: 'personal' }),
};

describe('workspace user fields list handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace-1');
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'view_users_public_info',
    });
    mocks.order.mockResolvedValue({
      data: [{ id: 'field-1', ws_id: 'workspace-1' }],
      error: null,
    });

    const query = {
      eq: vi.fn().mockReturnThis(),
      order: mocks.order,
      select: vi.fn().mockReturnThis(),
    };
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => query),
    });
  });

  it('returns workspace-scoped fields for an authorized Contacts actor', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/personal/users/fields'
    );

    const response = await handleListWorkspaceUserFieldsRequest(
      request,
      context,
      actor
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { id: 'field-1', ws_id: 'workspace-1' },
    ]);
    expect(mocks.getPermissions).toHaveBeenCalledWith({
      request,
      user: actor,
      wsId: 'workspace-1',
    });
    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(mocks.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
  });

  it('rejects actors without user-view permissions before querying fields', async () => {
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => false,
    });

    const response = await handleListWorkspaceUserFieldsRequest(
      new Request(
        'https://contacts.tuturuuu.com/api/v1/workspaces/personal/users/fields'
      ),
      context,
      actor
    );

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns the legacy error shape when fields cannot be loaded', async () => {
    mocks.order.mockResolvedValue({
      data: null,
      error: { message: 'database unavailable' },
    });

    const response = await handleListWorkspaceUserFieldsRequest(
      new Request(
        'https://contacts.tuturuuu.com/api/v1/workspaces/personal/users/fields'
      ),
      context,
      actor
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: 'Error fetching workspace API configs',
    });
  });
});
