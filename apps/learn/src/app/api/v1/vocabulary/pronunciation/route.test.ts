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

describe('pronunciation analysis AI credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
    mocks.resolveWorkspace.mockResolvedValue('workspace-id');
  });

  it('does not call Gemini when workspace credit preflight fails', async () => {
    mocks.checkAiCredits.mockResolvedValue({
      allowed: false,
      errorCode: 'CREDITS_EXHAUSTED',
      errorMessage: 'No credits remain.',
    });
    const provider = vi.fn();
    vi.stubGlobal('fetch', provider);

    const response = await POST(
      new NextRequest(
        'https://learn.tuturuuu.com/api/v1/vocabulary/pronunciation',
        {
          body: JSON.stringify({
            audioData: Buffer.from('audio').toString('base64'),
            mimeType: 'audio/webm',
            targetText: 'Hello.',
          }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }
      )
    );

    expect(response.status).toBe(403);
    expect(provider).not.toHaveBeenCalled();
    expect(mocks.checkAiCredits).toHaveBeenCalledWith(
      'workspace-id',
      'gemini-2.5-flash',
      'generate',
      expect.objectContaining({
        userId: '11111111-1111-4111-8111-111111111111',
      })
    );
  });
});
