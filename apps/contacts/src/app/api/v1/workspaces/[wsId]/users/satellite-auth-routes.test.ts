import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSatelliteAppSessionUser: vi.fn(),
  handleBulkImportWorkspaceUsersRequest: vi.fn(),
  handleCreateAvatarUploadRequest: vi.fn(),
  handleGetAvatarRequest: vi.fn(),
  handleGetUserEmailsRequest: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.getSatelliteAppSessionUser,
}));

vi.mock('@tuturuuu/users-core/routes/users/avatar', () => ({
  handleCreateAvatarUploadRequest: mocks.handleCreateAvatarUploadRequest,
  handleGetAvatarRequest: mocks.handleGetAvatarRequest,
}));

vi.mock('@tuturuuu/users-core/routes/users/bulk-import', () => ({
  handleBulkImportWorkspaceUsersRequest:
    mocks.handleBulkImportWorkspaceUsersRequest,
}));

vi.mock('@tuturuuu/users-core/routes/users/user-emails', () => ({
  handleGetUserEmailsRequest: mocks.handleGetUserEmailsRequest,
}));

vi.mock('@/lib/legacy-head', () => ({
  createLegacyHeadHandler: vi.fn(() => vi.fn()),
}));

import * as emailsRoute from './[userId]/emails/route';
import * as avatarRoute from './avatar/route';
import * as bulkImportRoute from './bulk-import/route';

const actor = { email: 'member@example.com', id: 'actor-1' };
const workspaceContext = {
  params: Promise.resolve({ wsId: 'workspace-1' }),
};
const userContext = {
  params: Promise.resolve({ userId: 'workspace-user-1', wsId: 'workspace-1' }),
};

describe('Contacts native user API satellite authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSatelliteAppSessionUser.mockResolvedValue(actor);
    for (const handler of [
      mocks.handleBulkImportWorkspaceUsersRequest,
      mocks.handleCreateAvatarUploadRequest,
      mocks.handleGetAvatarRequest,
      mocks.handleGetUserEmailsRequest,
    ]) {
      handler.mockResolvedValue(Response.json({ ok: true }));
    }
  });

  it.each([
    ['avatar GET', avatarRoute.GET, workspaceContext],
    ['avatar POST', avatarRoute.POST, workspaceContext],
    ['bulk import', bulkImportRoute.POST, workspaceContext],
    ['sent emails', emailsRoute.GET, userContext],
  ])('passes the Contacts actor through %s', async (_name, route, context) => {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/test',
      {
        method:
          _name === 'avatar GET' || _name === 'sent emails' ? 'GET' : 'POST',
      }
    );

    const response = await route(request, context as never);

    expect(response.status).toBe(200);
    expect(mocks.getSatelliteAppSessionUser).toHaveBeenCalledWith('contacts');
    expect(
      [
        mocks.handleBulkImportWorkspaceUsersRequest,
        mocks.handleCreateAvatarUploadRequest,
        mocks.handleGetAvatarRequest,
        mocks.handleGetUserEmailsRequest,
      ].some((handler) =>
        handler.mock.calls.some(
          (call) => call[0] === request && call[2] === actor
        )
      )
    ).toBe(true);
  });

  it.each([
    ['avatar GET', avatarRoute.GET, workspaceContext],
    ['avatar POST', avatarRoute.POST, workspaceContext],
    ['bulk import', bulkImportRoute.POST, workspaceContext],
    ['sent emails', emailsRoute.GET, userContext],
  ])(
    'rejects %s without an app-session actor',
    async (_name, route, context) => {
      mocks.getSatelliteAppSessionUser.mockResolvedValue(null);
      const request = new Request(
        'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/test'
      );

      const response = await route(request, context as never);

      expect(response.status).toBe(401);
    }
  );
});
