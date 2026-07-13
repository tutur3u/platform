import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSatelliteAppSessionUser: vi.fn(),
  handleCreateWorkspaceUserRequest: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.getSatelliteAppSessionUser,
}));

vi.mock('@tuturuuu/users-core/routes/users/list', () => ({
  GET: vi.fn(),
}));

vi.mock('@tuturuuu/users-core/routes/users/workspace-user-create', () => ({
  handleCreateWorkspaceUserRequest: mocks.handleCreateWorkspaceUserRequest,
}));

import { POST } from './route';

const actor = {
  email: 'manager@example.com',
  id: 'actor-1',
};
const context = {
  params: Promise.resolve({ wsId: 'workspace-1' }),
};

describe('Contacts workspace user collection route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSatelliteAppSessionUser.mockResolvedValue(actor);
    mocks.handleCreateWorkspaceUserRequest.mockResolvedValue(
      Response.json({ message: 'success' })
    );
  });

  it('passes the Contacts app-session actor to workspace user creation', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users',
      {
        body: JSON.stringify({ full_name: 'Alice Example' }),
        method: 'POST',
      }
    );

    const response = await POST(request, context);

    expect(response.status).toBe(200);
    expect(mocks.getSatelliteAppSessionUser).toHaveBeenCalledWith('contacts');
    expect(mocks.handleCreateWorkspaceUserRequest).toHaveBeenCalledWith(
      request,
      context,
      actor
    );
  });

  it('rejects creation without a Contacts app-session actor', async () => {
    mocks.getSatelliteAppSessionUser.mockResolvedValue(null);
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users',
      {
        body: JSON.stringify({ full_name: 'Alice Example' }),
        method: 'POST',
      }
    );

    const response = await POST(request, context);

    expect(response.status).toBe(401);
    expect(mocks.handleCreateWorkspaceUserRequest).not.toHaveBeenCalled();
  });
});
