import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  byId: vi.fn(),
  byName: vi.fn(),
  policiesIn: vi.fn(),
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

function createWorkspaceQuery() {
  const result = {
    data: [
      {
        id: '42529372-c669-4833-bb32-2cab1f4ffd83',
        name: 'Easy Center',
      },
    ],
    error: null,
  };
  const query = {
    ...result,
    eq: mocks.byId,
    ilike: mocks.byName,
    limit: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  mocks.byId.mockReturnValue(query);
  mocks.byName.mockReturnValue(query);
  return query;
}

function createAuthorizedResult() {
  const workspaceQuery = createWorkspaceQuery();
  const policyQuery = {
    from: vi.fn(),
    in: mocks.policiesIn,
    select: vi.fn(),
  };
  policyQuery.from.mockReturnValue(policyQuery);
  policyQuery.select.mockReturnValue(policyQuery);
  mocks.policiesIn.mockResolvedValue({
    data: [
      {
        allowed_models: ['openai/gpt-5'],
        capture_enabled: true,
        content_retention_days: 30,
        denied_models: [],
        metadata_retention_days: 365,
        monthly_credit_budget: '12.5',
        no_training_enforced: true,
        requests_per_minute: 60,
        state: 'enabled',
        ws_id: '42529372-c669-4833-bb32-2cab1f4ffd83',
      },
    ],
    error: null,
  });

  return {
    ok: true as const,
    sbAdmin: {
      from: vi.fn().mockReturnValue(workspaceQuery),
      schema: vi.fn().mockReturnValue(policyQuery),
    },
  };
}

describe('Infrastructure AI Studio workspace policy search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue(createAuthorizedResult());
  });

  it('searches workspace names server-side and merges their policies', async () => {
    const response = await GET(
      new NextRequest(
        'https://infrastructure.example/api/v1/infrastructure/ai/studio/workspaces?q=Easy%20Center'
      )
    );

    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledWith('manage_workspace_roles');
    expect(mocks.byName).toHaveBeenCalledWith('name', '%Easy Center%');
    expect(mocks.policiesIn).toHaveBeenCalledWith('ws_id', [
      '42529372-c669-4833-bb32-2cab1f4ffd83',
    ]);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        allowedModels: ['openai/gpt-5'],
        monthlyCreditBudget: 12.5,
        state: 'enabled',
        workspaceName: 'Easy Center',
        wsId: '42529372-c669-4833-bb32-2cab1f4ffd83',
      }),
    ]);
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
