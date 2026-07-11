import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  collectSearchParams: vi.fn(() => ({ page: '1' })),
  getSatelliteAppSessionUser: vi.fn(),
  handleUsersDatabaseRequest: vi.fn(),
  readJsonObject: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.getSatelliteAppSessionUser,
}));

vi.mock('@tuturuuu/users-core/routes/users/database', () => ({
  collectSearchParams: mocks.collectSearchParams,
  handleUsersDatabaseRequest: mocks.handleUsersDatabaseRequest,
  readJsonObject: mocks.readJsonObject,
}));

vi.mock('@/lib/legacy-head', () => ({
  createLegacyHeadHandler: vi.fn(() => vi.fn()),
}));

import { GET, POST } from './route';

const context = {
  params: Promise.resolve({ wsId: 'workspace-1' }),
};
const actor = {
  email: 'member@example.com',
  id: 'user-1',
};

describe('Contacts users database route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSatelliteAppSessionUser.mockResolvedValue(actor);
    mocks.handleUsersDatabaseRequest.mockResolvedValue(
      Response.json({ data: [] })
    );
    mocks.readJsonObject.mockResolvedValue({ page: 2 });
  });

  it('passes the Contacts app-session actor to GET requests', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/database?page=1'
    );

    await GET(request, context);

    expect(mocks.getSatelliteAppSessionUser).toHaveBeenCalledWith('contacts');
    expect(mocks.handleUsersDatabaseRequest).toHaveBeenCalledWith(
      request,
      context,
      { page: '1' },
      actor
    );
  });

  it('passes the Contacts app-session actor to POST requests', async () => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/database',
      { method: 'POST' }
    );

    await POST(request, context);

    expect(mocks.handleUsersDatabaseRequest).toHaveBeenCalledWith(
      request,
      context,
      { page: 2 },
      actor
    );
  });

  it('rejects requests without a Contacts app-session actor', async () => {
    mocks.getSatelliteAppSessionUser.mockResolvedValue(null);
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/database'
    );

    const response = await GET(request, context);

    expect(response.status).toBe(401);
    expect(mocks.handleUsersDatabaseRequest).not.toHaveBeenCalled();
  });
});
