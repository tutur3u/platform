import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  approval: vi.fn(),
  authorize: vi.fn(),
  generate: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
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

import { PATCH } from './route';

function createAdminClient() {
  const query = {
    eq: vi.fn(),
    from: vi.fn(),
    maybeSingle: mocks.maybeSingle,
    schema: vi.fn(),
    select: vi.fn(),
    update: mocks.update,
  };
  for (const method of ['eq', 'from', 'schema', 'select', 'update'] as const) {
    query[method].mockReturnValue(query);
  }
  return query;
}

describe('AI Studio existing key lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const sbAdmin = createAdminClient();
    mocks.authorize.mockResolvedValue({
      ok: true,
      sbAdmin,
      user: { id: 'user-1' },
      workspace: { id: 'workspace-1' },
    });
    mocks.maybeSingle.mockResolvedValue({
      data: { id: 'key-1', ws_id: 'workspace-1' },
    });
    const secondEq = vi.fn().mockResolvedValue({ error: null });
    const firstEq = vi.fn().mockReturnValue({ eq: secondEq });
    mocks.update.mockReturnValue({ eq: firstEq });
  });

  it('allows revocation without key-creation approval', async () => {
    mocks.approval.mockResolvedValue({ approved: false });
    const response = await PATCH(
      new Request('https://ai.example/api/keys/key-1', {
        body: JSON.stringify({ action: 'revoke' }),
        method: 'PATCH',
      }),
      {
        params: Promise.resolve({ keyId: 'key-1', wsId: 'workspace-1' }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ revoked: true });
    expect(mocks.approval).not.toHaveBeenCalled();
  });

  it('blocks rotation without key-creation approval', async () => {
    mocks.approval.mockResolvedValue({ approved: false });
    const response = await PATCH(
      new Request('https://ai.example/api/keys/key-1', {
        body: JSON.stringify({ action: 'rotate' }),
        method: 'PATCH',
      }),
      {
        params: Promise.resolve({ keyId: 'key-1', wsId: 'workspace-1' }),
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
