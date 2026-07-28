import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getBearerToken: vi.fn(),
  verifyAppSessionRequest: vi.fn(),
  verifyMembership: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-coordination', () => ({
  getBearerAppCoordinationToken: mocks.getBearerToken,
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  verifyAppSessionRequest: mocks.verifyAppSessionRequest,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.verifyMembership,
}));

import { authenticateExternalAiRequest } from './auth';

const workspaceId = '449cdd3b-121b-40f7-9cee-28f5b582e204';

function request() {
  return new Request(
    'https://tuturuuu.com/api/v1/external-ai/chat/completions',
    {
      headers: {
        authorization: 'Bearer ttr_app_test',
        'x-tuturuuu-workspace-id': workspaceId,
      },
    }
  );
}

function adminWithRegistration() {
  const rows = [
    {
      name: 'EXTERNAL_APP_REGISTRY:cybershield35:allowedScopes',
      value: JSON.stringify(['ai:use', 'tts:use']),
    },
    {
      name: 'EXTERNAL_APP_REGISTRY:cybershield35:allowedWorkspaceIds',
      value: JSON.stringify([workspaceId]),
    },
    {
      name: 'EXTERNAL_APP_REGISTRY:cybershield35:enabled',
      value: 'true',
    },
  ];
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: async () => ({ data: rows, error: null }),
        }),
      }),
    }),
  };
}

describe('authenticateExternalAiRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBearerToken.mockReturnValue('ttr_app_test');
    mocks.verifyAppSessionRequest.mockReturnValue({
      claims: {
        scopes: ['workspace:session', 'ai:use', 'tts:use'],
        sub: 'user-1',
        target_app: 'cybershield35',
      },
      ok: true,
    });
    mocks.createAdminClient.mockResolvedValue(adminWithRegistration());
    mocks.verifyMembership.mockResolvedValue({ ok: true });
  });

  it('authorizes a linked workspace member with the required app scope', async () => {
    await expect(authenticateExternalAiRequest(request())).resolves.toEqual({
      actorId: 'user-1',
      appId: 'cybershield35',
      scopes: ['workspace:session', 'ai:use', 'tts:use'],
      workspaceId,
    });
    expect(mocks.verifyAppSessionRequest).toHaveBeenCalledWith(
      expect.any(Request),
      { requiredScope: 'ai:use' }
    );
    expect(mocks.verifyMembership).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredType: 'MEMBER',
        userId: 'user-1',
        wsId: workspaceId,
      })
    );
  });

  it('rejects requests without an external-app bearer token', async () => {
    mocks.getBearerToken.mockReturnValue(null);

    await expect(
      authenticateExternalAiRequest(request())
    ).rejects.toMatchObject({
      code: 'invalid_api_key',
      status: 401,
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('rejects a token after workspace membership is removed', async () => {
    mocks.verifyMembership.mockResolvedValue({
      error: 'membership_not_found',
      ok: false,
    });

    await expect(
      authenticateExternalAiRequest(request())
    ).rejects.toMatchObject({
      code: 'invalid_api_key',
      status: 403,
    });
  });
});
