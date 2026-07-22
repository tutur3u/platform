import { describe, expect, it, vi } from 'vitest';
import { addRoleMembers, removeRoleMember } from './roles';
import { createWorkspaceRole } from './settings';

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

describe('workspace role mutation helpers', () => {
  it('creates roles and assigns and removes members using encoded routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({ id: 'role-1', message: 'success' }, 201)
      )
      .mockResolvedValueOnce(response({ message: 'success' }))
      .mockResolvedValueOnce(response({ message: 'success' }));
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };
    const payload = {
      name: 'Administrator',
      permissions: [{ enabled: true, id: 'admin' }],
    };

    const role = await createWorkspaceRole('workspace/1', payload, options);
    await addRoleMembers('workspace/1', role.id, ['user/1'], options);
    await removeRoleMember('workspace/1', role.id, 'user/1', options);

    expect(role.id).toBe('role-1');
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/workspace%2F1/roles',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/workspace%2F1/roles/role-1/members',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/v1/workspaces/workspace%2F1/roles/role-1/members/user%2F1',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      memberIds: ['user/1'],
    });
  });
});
