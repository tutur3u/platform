import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  approval: vi.fn(),
  authorize: vi.fn(),
  generate: vi.fn(),
}));

vi.mock('@tuturuuu/ai/api-key-hash', () => ({
  generateAiApiKey: mocks.generate,
}));
vi.mock('@/lib/session-api', () => ({
  aiKeyCreationApprovalRequiredResponse: () =>
    Response.json(
      { code: 'AI_KEY_CREATION_APPROVAL_REQUIRED' },
      { status: 403 }
    ),
  authorizeAiStudioWorkspaceRequest: mocks.authorize,
  getAiKeyCreationApproval: mocks.approval,
}));
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn(),
}));

import { GET, POST } from './route';

const context = { params: Promise.resolve({ wsId: 'workspace-1' }) };

function adminClientReturning(rows: Array<{ name: string; value: string }>) {
  return {
    from: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: rows, error: null }),
      select: vi.fn().mockReturnThis(),
    }),
    schema: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi
              .fn()
              .mockResolvedValue({ data: { id: 'key-1' }, error: null }),
          }),
        }),
      }),
    }),
  };
}

function issueRequest(body: Record<string, unknown>) {
  return new Request('https://ai.example/api/keys', {
    body: JSON.stringify(body),
    method: 'POST',
  });
}

describe('binding a key to an external app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.approval.mockResolvedValue({ approved: true });
    mocks.generate.mockResolvedValue({ hash: 'hash', prefix: 'ttr_ai_abc123' });
  });

  it('refuses a binding to an app that is not linked to this workspace', async () => {
    // Otherwise anyone able to manage keys could invent an app id and move their
    // usage onto the unmetered path.
    mocks.authorize.mockResolvedValue({
      ok: true,
      permissions: {},
      sbAdmin: adminClientReturning([
        { name: 'EXTERNAL_APP_REGISTRY:cybershield35:enabled', value: 'true' },
        {
          name: 'EXTERNAL_APP_REGISTRY:cybershield35:allowedWorkspaceIds',
          value: '["another-workspace"]',
        },
      ]),
      user: { id: 'user-1' },
      workspace: { id: 'workspace-1' },
    });

    const response = await POST(
      issueRequest({ externalAppId: 'cybershield35', name: 'cs35 worker' }),
      context
    );

    expect(response.status).toBe(400);
  });

  it('refuses a binding to a disabled app', async () => {
    mocks.authorize.mockResolvedValue({
      ok: true,
      permissions: {},
      sbAdmin: adminClientReturning([
        { name: 'EXTERNAL_APP_REGISTRY:cybershield35:enabled', value: 'false' },
        {
          name: 'EXTERNAL_APP_REGISTRY:cybershield35:allowedWorkspaceIds',
          value: '["workspace-1"]',
        },
      ]),
      user: { id: 'user-1' },
      workspace: { id: 'workspace-1' },
    });

    const response = await POST(
      issueRequest({ externalAppId: 'cybershield35', name: 'cs35 worker' }),
      context
    );

    expect(response.status).toBe(400);
  });

  it('issues a bound key when the app is enabled and linked', async () => {
    mocks.authorize.mockResolvedValue({
      ok: true,
      permissions: {},
      sbAdmin: adminClientReturning([
        { name: 'EXTERNAL_APP_REGISTRY:cybershield35:enabled', value: 'true' },
        {
          name: 'EXTERNAL_APP_REGISTRY:cybershield35:allowedWorkspaceIds',
          value: '["workspace-1"]',
        },
      ]),
      user: { id: 'user-1' },
      workspace: { id: 'workspace-1' },
    });

    const response = await POST(
      issueRequest({ externalAppId: 'cybershield35', name: 'cs35 worker' }),
      context
    );

    expect(response.status).toBe(201);
  });

  it('rejects a malformed app id before touching the registry', async () => {
    mocks.authorize.mockResolvedValue({
      ok: true,
      permissions: {},
      sbAdmin: adminClientReturning([]),
      user: { id: 'user-1' },
      workspace: { id: 'workspace-1' },
    });

    const response = await POST(
      issueRequest({ externalAppId: 'Not An App!', name: 'cs35 worker' }),
      context
    );

    expect(response.status).toBe(400);
  });
});

describe('AI Studio key creation approval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({
      ok: true,
      permissions: {},
      sbAdmin: {},
      user: { id: 'user-1' },
      workspace: { id: 'workspace-1' },
    });
  });

  it('blocks issuance without the standing platform approval', async () => {
    mocks.approval.mockResolvedValue({ approved: false });
    const response = await POST(
      new Request('https://ai.example/api/keys', {
        body: JSON.stringify({ name: 'Production' }),
        method: 'POST',
      }),
      context
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: 'AI_KEY_CREATION_APPROVAL_REQUIRED',
    });
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON after approval', async () => {
    mocks.approval.mockResolvedValue({ approved: true });
    const response = await POST(
      new Request('https://ai.example/api/keys', {
        body: '{',
        method: 'POST',
      }),
      context
    );

    expect(response.status).toBe(400);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('returns cursor-paginated existing keys regardless of creation approval', async () => {
    const limit = vi.fn().mockResolvedValue({
      data: [
        {
          created_at: '2026-07-29T01:00:00.000Z',
          id: '0b9bd97c-2a2e-447e-8446-4b05495968d2',
          name: 'First',
        },
        {
          created_at: '2026-07-28T01:00:00.000Z',
          id: '1b9bd97c-2a2e-447e-8446-4b05495968d2',
          name: 'Second',
        },
      ],
      error: null,
    });
    const chain = {
      eq: vi.fn().mockReturnThis(),
      limit,
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
    };
    mocks.authorize.mockResolvedValue({
      ok: true,
      permissions: {},
      sbAdmin: {
        schema: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue(chain),
        }),
      },
      user: { id: 'user-1' },
      workspace: { id: 'workspace-1' },
    });
    mocks.approval.mockResolvedValue({ approved: false });

    const response = await GET(
      new Request('https://ai.example/api/keys?limit=1'),
      context
    );

    expect(response.status).toBe(200);
    expect(limit).toHaveBeenCalledWith(2);
    await expect(response.json()).resolves.toEqual({
      approval: { approved: false },
      keys: [
        {
          created_at: '2026-07-29T01:00:00.000Z',
          id: '0b9bd97c-2a2e-447e-8446-4b05495968d2',
          name: 'First',
        },
      ],
      nextCursor:
        '2026-07-29T01:00:00.000Z~0b9bd97c-2a2e-447e-8446-4b05495968d2',
    });
  });
});
