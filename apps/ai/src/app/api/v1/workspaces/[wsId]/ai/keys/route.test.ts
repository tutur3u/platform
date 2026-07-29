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
