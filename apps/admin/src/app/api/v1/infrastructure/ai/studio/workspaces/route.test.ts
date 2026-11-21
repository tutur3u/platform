import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureAdminRequest: mocks.authorize,
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { GET } from './route';

function createAuthorizedResult() {
  mocks.rpc.mockResolvedValue({
    data: [
      {
        allowed_models: ['openai/gpt-5'],
        api_key_creation_approved: true,
        api_key_creation_decided_at: '2026-07-28T00:00:00.000Z',
        api_key_creation_decided_by: '42529372-c669-4833-bb32-2cab1f4ffd83',
        capture_enabled: true,
        content_retention_days: 30,
        denied_models: [],
        metadata_retention_days: 365,
        monthly_credit_budget: '12.5',
        no_training_enforced: true,
        requests_per_minute: 60,
        ws_id: '42529372-c669-4833-bb32-2cab1f4ffd83',
        workspace_name: 'Easy Center',
      },
    ],
    error: null,
  });

  return {
    ok: true as const,
    sbAdmin: {
      schema: vi.fn().mockReturnValue({ rpc: mocks.rpc }),
    },
  };
}

describe('Infrastructure AI Studio workspace policy search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue(createAuthorizedResult());
  });

  it('searches workspace names and partial IDs server-side', async () => {
    const response = await GET(
      new NextRequest(
        'https://infrastructure.example/api/v1/infrastructure/ai/studio/workspaces?q=2cab1f4f&limit=1&cursor=0'
      )
    );

    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith('manage_workspace_roles');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'search_ai_studio_policy_workspaces',
      {
        p_limit: 2,
        p_offset: 0,
        p_query: '2cab1f4f',
      }
    );
    await expect(response.json()).resolves.toEqual({
      items: [
        expect.objectContaining({
          allowedModels: ['openai/gpt-5'],
          apiKeyCreationApproved: true,
          monthlyCreditBudget: 12.5,
          workspaceName: 'Easy Center',
          wsId: '42529372-c669-4833-bb32-2cab1f4ffd83',
        }),
      ],
      nextCursor: null,
    });
  });

  it('returns a stable next cursor and rejects malformed cursors', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          allowed_models: [],
          api_key_creation_approved: false,
          api_key_creation_decided_at: null,
          api_key_creation_decided_by: null,
          capture_enabled: null,
          content_retention_days: null,
          denied_models: [],
          metadata_retention_days: null,
          monthly_credit_budget: null,
          no_training_enforced: true,
          requests_per_minute: null,
          ws_id: '42529372-c669-4833-bb32-2cab1f4ffd83',
          workspace_name: 'First',
        },
        {
          allowed_models: [],
          api_key_creation_approved: false,
          api_key_creation_decided_at: null,
          api_key_creation_decided_by: null,
          capture_enabled: null,
          content_retention_days: null,
          denied_models: [],
          metadata_retention_days: null,
          monthly_credit_budget: null,
          no_training_enforced: true,
          requests_per_minute: null,
          ws_id: '52529372-c669-4833-bb32-2cab1f4ffd83',
          workspace_name: 'Second',
        },
      ],
      error: null,
    });

    const pageResponse = await GET(
      new NextRequest(
        'https://infrastructure.example/api/v1/infrastructure/ai/studio/workspaces?limit=1&cursor=10'
      )
    );
    const invalidResponse = await GET(
      new NextRequest(
        'https://infrastructure.example/api/v1/infrastructure/ai/studio/workspaces?cursor=not-a-cursor'
      )
    );

    expect(pageResponse.status).toBe(200);
    await expect(pageResponse.json()).resolves.toMatchObject({
      nextCursor: '11',
    });
    expect(invalidResponse.status).toBe(400);
  });

  it('requires Infrastructure role-management permission', async () => {
    mocks.authorize.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await GET(
      new NextRequest(
        'https://infrastructure.example/api/v1/infrastructure/ai/studio/workspaces'
      )
    );

    expect(response.status).toBe(403);
  });
});
