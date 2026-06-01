import { describe, expect, it } from 'vitest';
import { normalizeWorkspaceAccessRole } from './adapters';

describe('workspace access adapters', () => {
  it('normalizes role permissions into the shared access role shape', () => {
    expect(
      normalizeWorkspaceAccessRole({
        created_at: '2026-06-01T00:00:00.000Z',
        id: 'role-editor',
        name: 'Editor',
        permissions: [
          { enabled: true, id: 'manage_workspace_members' },
          { enabled: false, id: 'manage_workspace_roles' },
        ],
        user_count: 2,
        ws_id: 'ws_123',
      })
    ).toEqual({
      created_at: '2026-06-01T00:00:00.000Z',
      id: 'role-editor',
      members: undefined,
      name: 'Editor',
      permissions: [
        { enabled: true, id: 'manage_workspace_members' },
        { enabled: false, id: 'manage_workspace_roles' },
      ],
      user_count: 2,
      ws_id: 'ws_123',
    });
  });
});
