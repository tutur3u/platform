import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  getSatelliteAppSessionUser: vi.fn(),
  handleListWorkspaceUserFieldsRequest: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: mocks.connection,
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.getSatelliteAppSessionUser,
}));

vi.mock('@tuturuuu/users-core/routes/users/fields', () => ({
  handleListWorkspaceUserFieldsRequest:
    mocks.handleListWorkspaceUserFieldsRequest,
}));

vi.mock('@/lib/legacy-head', () => ({
  createLegacyHeadHandler: vi.fn(() => vi.fn()),
}));

import { GET } from './route';

const context = {
  params: Promise.resolve({ wsId: 'workspace-1' }),
};
const actor = {
  email: 'member@example.com',
  id: 'user-1',
};

describe('Contacts workspace user fields route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connection.mockResolvedValue(undefined);
    mocks.getSatelliteAppSessionUser.mockResolvedValue(actor);
    mocks.handleListWorkspaceUserFieldsRequest.mockResolvedValue(
      Response.json([])
    );
  });

  it('serves fields locally with the Contacts app-session actor', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/fields'
    );

    await GET(request, context);

    expect(mocks.getSatelliteAppSessionUser).toHaveBeenCalledWith('contacts');
    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.handleListWorkspaceUserFieldsRequest).toHaveBeenCalledWith(
      request,
      context,
      actor
    );
  });

  it('rejects requests without a Contacts app-session actor', async () => {
    mocks.getSatelliteAppSessionUser.mockResolvedValue(null);
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/fields'
    );

    const response = await GET(request, context);

    expect(response.status).toBe(401);
    expect(mocks.handleListWorkspaceUserFieldsRequest).not.toHaveBeenCalled();
  });
});
