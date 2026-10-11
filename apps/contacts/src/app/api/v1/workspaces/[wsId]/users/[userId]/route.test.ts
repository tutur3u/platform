import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSatelliteAppSessionUser: vi.fn(),
  connection: vi.fn(),
  handleGetWorkspaceUserRequest: vi.fn(),
  handleDeleteWorkspaceUserRequest: vi.fn(),
  handleUpdateWorkspaceUserRequest: vi.fn(),
}));

vi.mock('next/server', () => ({ connection: mocks.connection }));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.getSatelliteAppSessionUser,
}));

vi.mock('@tuturuuu/users-core/routes/users/workspace-user', () => ({
  handleDeleteWorkspaceUserRequest: mocks.handleDeleteWorkspaceUserRequest,
  handleGetWorkspaceUserRequest: mocks.handleGetWorkspaceUserRequest,
  handleUpdateWorkspaceUserRequest: mocks.handleUpdateWorkspaceUserRequest,
}));

import { DELETE, GET, PUT } from './route';

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

describe('Contacts workspace recipient GET route', () => {
  const request = new Request('https://contacts.example/api/user');
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.getSatelliteAppSessionUser.mockResolvedValue(actor);
    mocks.handleGetWorkspaceUserRequest.mockResolvedValue(
      Response.json(
        { id: 'user-1', full_name: null, display_name: null, email: null },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    );
  });

  it('waits for request time and delegates to the real exported GET with Contacts actor', async () => {
    const response = await GET(request, context);
    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getSatelliteAppSessionUser.mock.invocationCallOrder[0]!
    );
    expect(mocks.getSatelliteAppSessionUser).toHaveBeenCalledWith('contacts');
    expect(mocks.handleGetWorkspaceUserRequest).toHaveBeenCalledWith(
      request,
      context,
      actor
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      id: 'user-1',
      full_name: null,
      display_name: null,
      email: null,
    });
  });

  it('rejects unauthenticated GET without invoking the data handler', async () => {
    mocks.getSatelliteAppSessionUser.mockResolvedValue(null);
    const response = await GET(request, context);
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.handleGetWorkspaceUserRequest).not.toHaveBeenCalled();
  });

  it('keeps unexpected session errors generic and uncacheable', async () => {
    mocks.getSatelliteAppSessionUser.mockRejectedValueOnce(
      new Error('private session detail')
    );
    const response = await GET(request, context);
    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual({
      message: 'Error fetching workspace user',
    });
    expect(mocks.handleGetWorkspaceUserRequest).not.toHaveBeenCalled();
  });
});
