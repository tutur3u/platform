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
} from './public-credential';

function externalRequest() {
  return new Request('https://ai.tuturuuu.com/v1/responses', {
    headers: {
      authorization: 'Bearer ttr_app_external-token',
      [AI_STUDIO_WORKSPACE_HEADER]: '22222222-2222-4222-8222-222222222222',
    },
  });
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
    mocks.createAdminClient.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () =>
              Promise.resolve({
                data: [
                  {
                    name: 'EXTERNAL_APP_REGISTRY:cybershield35:enabled',
                    value: 'true',
                  },
                  {
                    name: 'EXTERNAL_APP_REGISTRY:cybershield35:allowedScopes',
                    value: JSON.stringify(['ai:use', 'tts:use']),
                  },
                  {
                    name: 'EXTERNAL_APP_REGISTRY:cybershield35:allowedWorkspaceIds',
                    value: JSON.stringify([
                      '22222222-2222-4222-8222-222222222222',
                    ]),
                  },
                ],
                error: null,
              }),
          }),
        }),
      }),
    });
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
    mocks.createAdminClient.mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () =>
              Promise.resolve({
                data: [
                  {
                    name: 'EXTERNAL_APP_REGISTRY:cybershield35:enabled',
                    value: 'true',
                  },
                  {
                    name: 'EXTERNAL_APP_REGISTRY:cybershield35:allowedScopes',
                    value: JSON.stringify(['ai:use']),
                  },
                  {
                    name: 'EXTERNAL_APP_REGISTRY:cybershield35:allowedWorkspaceIds',
                    value: JSON.stringify([]),
                  },
                ],
                error: null,
              }),
          }),
        }),
      }),
    });

    await expect(
      authenticatePublicAiRequest(externalRequest())
    ).rejects.toMatchObject({ status: 403 });
  });
});
