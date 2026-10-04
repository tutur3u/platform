import { InternalApiError } from '@tuturuuu/internal-api/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSatelliteAppSessionUser: vi.fn(),
  handleBulkImportWorkspaceUsersRequest: vi.fn(),
  createAppSessionToken: vi.fn(),
  createWorkspaceUserAvatarUploadUrl: vi.fn(),
  handleGetAvatarRequest: vi.fn(),
  handleGetUserEmailsRequest: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.getSatelliteAppSessionUser,
}));

vi.mock('@tuturuuu/users-core/routes/users/avatar', () => ({
  handleGetAvatarRequest: mocks.handleGetAvatarRequest,
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  createAppSessionToken: mocks.createAppSessionToken,
}));

vi.mock('@tuturuuu/internal-api/profile-media', () => ({
  createWorkspaceUserAvatarUploadUrl: mocks.createWorkspaceUserAvatarUploadUrl,
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
    mocks.createAppSessionToken.mockReturnValue({ token: 'synthetic-access' });
    mocks.createWorkspaceUserAvatarUploadUrl.mockResolvedValue({
      uploadUrl: 'https://platform.test/api/avatar?token=synthetic-ticket',
      filePath: 'workspace-1/users/synthetic.webp',
    });
    for (const handler of [
      mocks.handleBulkImportWorkspaceUsersRequest,
      mocks.handleGetAvatarRequest,
      mocks.handleGetUserEmailsRequest,
    ]) {
      handler.mockResolvedValue(Response.json({ ok: true }));
    }
  });

  it.each([
    ['avatar GET', avatarRoute.GET, workspaceContext],
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
        mocks.handleGetAvatarRequest,
        mocks.handleGetUserEmailsRequest,
      ].some((handler) =>
        handler.mock.calls.some(
          (call) => call[0] === request && call[2] === actor
        )
      )
    ).toBe(true);
  });

  it('delegates avatar POST through a scoped platform token for the Contacts actor', async () => {
    const request = new Request('https://contacts.tuturuuu.com/api/avatar', {
      method: 'POST',
      body: JSON.stringify({ contentType: 'image/png' }),
    });
    const response = await avatarRoute.POST(request, workspaceContext);
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mocks.getSatelliteAppSessionUser).toHaveBeenCalledWith('contacts');
    expect(mocks.createAppSessionToken).toHaveBeenCalledWith({
      userId: actor.id,
      targetApp: 'platform',
      originApp: 'contacts',
      scopes: ['users:profile:write'],
      expiresInSeconds: 60,
    });
    expect(mocks.createWorkspaceUserAvatarUploadUrl).toHaveBeenCalledWith(
      'workspace-1',
      'image/png',
      { defaultHeaders: { Authorization: 'Bearer synthetic-access' } }
    );
    expect(await response.json()).toEqual({
      uploadUrl: 'https://platform.test/api/avatar?token=synthetic-ticket',
      filePath: 'workspace-1/users/synthetic.webp',
    });
  });

  it.each([429, 503])(
    'propagates central avatar protection failure %s without a ticket',
    async (status) => {
      mocks.createWorkspaceUserAvatarUploadUrl.mockRejectedValue(
        new InternalApiError('Synthetic protection failure', status)
      );
      const response = await avatarRoute.POST(
        new Request('https://contacts.test/api/avatar', {
          method: 'POST',
          body: JSON.stringify({ contentType: 'image/png' }),
        }),
        workspaceContext
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({
        message: 'Avatar upload unavailable',
      });
    }
  );

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
      expect(mocks.createAppSessionToken).not.toHaveBeenCalled();
      expect(mocks.createWorkspaceUserAvatarUploadUrl).not.toHaveBeenCalled();
    }
  );
});
