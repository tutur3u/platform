import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticateAiStudioRequest: vi.fn(),
  createAdminClient: vi.fn(),
  verifyAppSessionRequest: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/ai/studio/auth', () => ({
  authenticateAiStudioRequest: mocks.authenticateAiStudioRequest,
}));
vi.mock('@tuturuuu/auth/app-session', () => ({
  verifyAppSessionRequest: mocks.verifyAppSessionRequest,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

import {
  AI_STUDIO_WORKSPACE_HEADER,
  authenticatePublicAiRequest,
  EXTERNAL_TTS_SCOPE,
} from './public-credential';

const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';

function externalRequest() {
  return new Request('https://ai.tuturuuu.com/v1/responses', {
    headers: {
      authorization: 'Bearer ttr_app_external-token',
      [AI_STUDIO_WORKSPACE_HEADER]: WORKSPACE_ID,
    },
  });
}

function apiKeyRequest() {
  return new Request('https://ai.tuturuuu.com/v1/responses', {
    headers: { authorization: 'Bearer ttr_ai_bound-key' },
  });
}

function registryClient({
  allowedScopes = ['ai:use', 'tts:use'],
  allowedWorkspaceIds = [WORKSPACE_ID],
  enabled = 'true',
}: {
  allowedScopes?: string[];
  allowedWorkspaceIds?: string[];
  enabled?: string;
} = {}) {
  const prefix = 'EXTERNAL_APP_REGISTRY:cybershield35';
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () =>
            Promise.resolve({
              data: [
                { name: `${prefix}:enabled`, value: enabled },
                {
                  name: `${prefix}:allowedScopes`,
                  value: JSON.stringify(allowedScopes),
                },
                {
                  name: `${prefix}:allowedWorkspaceIds`,
                  value: JSON.stringify(allowedWorkspaceIds),
                },
              ],
              error: null,
            }),
        }),
      }),
    }),
  };
}

function boundKeyCredential() {
  return {
    actorId: null,
    apiKey: { external_app_id: 'cybershield35', id: 'key-1' },
    workspaceId: WORKSPACE_ID,
  };
}

describe('public AI credential policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyAppSessionRequest.mockReturnValue({
      claims: {
        scopes: ['ai:use', 'workspace:session'],
        sub: '11111111-1111-4111-8111-111111111111',
        target_app: 'cybershield35',
      },
      ok: true,
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.createAdminClient.mockResolvedValue(registryClient());
  });

  it('keeps ordinary AI API keys on the metered credential path', async () => {
    const apiKeyCredential = {
      actorId: 'actor',
      apiKey: { id: 'key' },
      workspaceId: 'workspace',
    };
    mocks.authenticateAiStudioRequest.mockResolvedValue(apiKeyCredential);

    await expect(
      authenticatePublicAiRequest(
        new Request('https://ai.tuturuuu.com/v1/responses', {
          headers: { authorization: 'Bearer ttr_ai_regular-key' },
        })
      )
    ).resolves.toEqual({ ...apiKeyCredential, kind: 'api-key' });
  });

  it('allows a registered, scoped, workspace-linked external app', async () => {
    await expect(
      authenticatePublicAiRequest(externalRequest())
    ).resolves.toMatchObject({
      appId: 'cybershield35',
      kind: 'external-app',
      workspaceId: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('rejects an external app token without workspace-session scope', async () => {
    mocks.verifyAppSessionRequest.mockReturnValue({
      claims: {
        scopes: ['ai:use'],
        sub: '11111111-1111-4111-8111-111111111111',
        target_app: 'cybershield35',
      },
      ok: true,
    });

    await expect(
      authenticatePublicAiRequest(externalRequest())
    ).rejects.toMatchObject({ status: 403 });
  });

  it('fails closed when the registered app is not linked to the workspace', async () => {
    mocks.createAdminClient.mockResolvedValue(
      registryClient({ allowedWorkspaceIds: [] })
    );

    await expect(
      authenticatePublicAiRequest(externalRequest())
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe('an API key bound to an external app', () => {
  // A bound key spends on the app's unmetered allocation, so the registration is
  // re-read on every request. Checking only at issuance would leave a key working
  // after the app was disabled, unlinked, or had a scope withdrawn.
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateAiStudioRequest.mockResolvedValue(boundKeyCredential());
    mocks.createAdminClient.mockResolvedValue(registryClient());
  });

  it('is accepted while the app stays enabled, linked and scoped', async () => {
    await expect(
      authenticatePublicAiRequest(apiKeyRequest())
    ).resolves.toMatchObject({
      apiKey: { external_app_id: 'cybershield35' },
      kind: 'api-key',
    });
  });

  it('is refused once the app is disabled', async () => {
    mocks.createAdminClient.mockResolvedValue(
      registryClient({ enabled: 'false' })
    );

    await expect(
      authenticatePublicAiRequest(apiKeyRequest())
    ).rejects.toMatchObject({ status: 403 });
  });

  it('is refused once the workspace is unlinked from the app', async () => {
    mocks.createAdminClient.mockResolvedValue(
      registryClient({ allowedWorkspaceIds: ['some-other-workspace'] })
    );

    await expect(
      authenticatePublicAiRequest(apiKeyRequest())
    ).rejects.toMatchObject({ status: 403 });
  });

  it('is refused for an operation the app is not scoped for', async () => {
    // Speech requires `tts:use`, which this registration does not grant.
    mocks.createAdminClient.mockResolvedValue(
      registryClient({ allowedScopes: ['ai:use'] })
    );

    await expect(
      authenticatePublicAiRequest(apiKeyRequest(), EXTERNAL_TTS_SCOPE)
    ).rejects.toMatchObject({ status: 403 });
  });

  it('does not consult the registry for an unbound key', async () => {
    // The metered path must not gain a dependency on the app registry.
    mocks.authenticateAiStudioRequest.mockResolvedValue({
      actorId: 'actor',
      apiKey: { external_app_id: null, id: 'key-2' },
      workspaceId: WORKSPACE_ID,
    });

    await expect(
      authenticatePublicAiRequest(apiKeyRequest())
    ).resolves.toMatchObject({ kind: 'api-key' });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
