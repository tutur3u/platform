import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSatelliteAppSessionUser: vi.fn(),
  handleDeleteWorkspaceUserRequest: vi.fn(),
  handleUpdateWorkspaceUserRequest: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.getSatelliteAppSessionUser,
}));

vi.mock('@tuturuuu/users-core/routes/users/workspace-user', () => ({
  handleDeleteWorkspaceUserRequest: mocks.handleDeleteWorkspaceUserRequest,
  handleUpdateWorkspaceUserRequest: mocks.handleUpdateWorkspaceUserRequest,
}));

import { DELETE, PUT } from './route';

const actor = {
  email: 'manager@example.com',
  id: 'actor-1',
};
const context = {
  params: Promise.resolve({ userId: 'user-1', wsId: 'workspace-1' }),
};

describe('Contacts workspace user mutation route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSatelliteAppSessionUser.mockResolvedValue(actor);
    mocks.handleUpdateWorkspaceUserRequest.mockResolvedValue(
      Response.json({ message: 'success' })
    );
    mocks.handleDeleteWorkspaceUserRequest.mockResolvedValue(
      Response.json({ message: 'success' })
    );
  });

  it('passes the Contacts app-session actor to workspace user updates', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/user-1',
      { method: 'PUT' }
    );

    const response = await PUT(request, context);

    expect(response.status).toBe(200);
    expect(mocks.getSatelliteAppSessionUser).toHaveBeenCalledWith('contacts');
    expect(mocks.handleUpdateWorkspaceUserRequest).toHaveBeenCalledWith(
      request,
      context,
      actor
    );
  });

  it('passes the Contacts app-session actor to workspace user deletes', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/user-1',
      { method: 'DELETE' }
    );

    const response = await DELETE(request, context);

    expect(response.status).toBe(200);
    expect(mocks.handleDeleteWorkspaceUserRequest).toHaveBeenCalledWith(
      request,
      context,
      actor
    );
  });

  it('rejects mutations without a Contacts app-session actor', async () => {
    mocks.getSatelliteAppSessionUser.mockResolvedValue(null);
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/user-1',
      { method: 'PUT' }
    );

    const response = await PUT(request, context);

    expect(response.status).toBe(401);
    expect(mocks.handleUpdateWorkspaceUserRequest).not.toHaveBeenCalled();
  });
});
