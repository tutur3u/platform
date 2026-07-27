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

import { POST as transcribeAudio } from './audio/route';
import { POST as extractImage } from './image/route';

describe('Calendar media AI credit policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspace.mockResolvedValue('workspace-id');
    mocks.checkAiCredits.mockResolvedValue({
      allowed: false,
      errorCode: 'CREDITS_EXHAUSTED',
      errorMessage: 'No credits remain.',
    });
  });

  it.each([
    ['audio', transcribeAudio, { base64Audio: 'audio-data' }],
    ['image', extractImage, { base64Image: 'image-data' }],
  ])(
    'blocks %s provider usage when workspace credit preflight fails',
    async (_kind, handler, body) => {
      const provider = vi.fn();
      vi.stubGlobal('fetch', provider);

      const response = await handler(
        new NextRequest('https://calendar.tuturuuu.com/api/v1/calendar/media', {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        })
      );

      expect(response.status).toBe(403);
      expect(provider).not.toHaveBeenCalled();
      expect(mocks.checkAiCredits).toHaveBeenCalledWith(
        'workspace-id',
        'gemini-2.0-flash',
        'generate',
        expect.objectContaining({
          userId: '11111111-1111-4111-8111-111111111111',
        })
      );
    }
  );
});
