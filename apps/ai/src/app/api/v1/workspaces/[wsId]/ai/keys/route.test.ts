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

import { POST } from './route';

const context = { params: Promise.resolve({ wsId: 'workspace-1' }) };

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
});
