import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkAiCredits: vi.fn(),
  deductAiCredits: vi.fn(),
  resolveWorkspace: vi.fn(),
  sessionContext: {
    supabase: {},
    user: { id: '11111111-1111-4111-8111-111111111111' },
  },
}));

vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: mocks.checkAiCredits,
  deductAiCredits: mocks.deductAiCredits,
}));
vi.mock('@tuturuuu/ai/memory/workspace', () => ({
  resolveAiMemoryWorkspaceIdForUser: mocks.resolveWorkspace,
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, context: unknown) => Promise<Response>) =>
    (request: Request) =>
      handler(request, mocks.sessionContext),
}));

import { POST } from './route';

function speechRequest() {
  return new NextRequest(
    'https://learn.tuturuuu.com/api/v1/vocabulary/speech',
    {
      body: JSON.stringify({ kind: 'word', text: 'hello' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }
  );
}

describe('vocabulary speech AI credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
    mocks.resolveWorkspace.mockResolvedValue('workspace-id');
    mocks.checkAiCredits.mockResolvedValue({
      allowed: true,
      errorCode: null,
      errorMessage: null,
    });
    mocks.deductAiCredits.mockResolvedValue({
      errorCode: null,
      success: true,
    });
  });

  it('fails closed before provider usage when the workspace has no credits', async () => {
    mocks.checkAiCredits.mockResolvedValue({
      allowed: false,
      errorCode: 'CREDITS_EXHAUSTED',
      errorMessage: 'No credits remain.',
    });
    const provider = vi.fn();
    vi.stubGlobal('fetch', provider);

    const response = await POST(speechRequest());

    expect(response.status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
  });

  it('settles generated audio against the resolved workspace', async () => {
    const pcm = Buffer.alloc(48_000);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          outputAudio: { data: pcm.toString('base64') },
        })
      )
    );

    const response = await POST(speechRequest());

    expect(response.status).toBe(200);
    expect(mocks.deductAiCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'gemini-3.1-flash-tts-preview',
        outputTokens: 25,
        userId: '11111111-1111-4111-8111-111111111111',
        wsId: 'workspace-id',
      })
    );
  });
});
