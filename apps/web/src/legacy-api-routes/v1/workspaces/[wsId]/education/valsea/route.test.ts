import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ValseaHandler = (
  request: NextRequest,
  context: {
    supabase: Record<string, never>;
    user: { id: string };
  },
  params: { wsId: string }
) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  checkEducationWorkspaceAccess: vi.fn(),
  withSessionAuth: vi.fn(),
}));

vi.mock('@ai-sdk/google', () => ({
  google: vi.fn(),
}));

vi.mock('@tuturuuu/ai/credits/check-credits', () => ({
  checkAiCredits: vi.fn(),
  deductAiCredits: vi.fn(),
}));

vi.mock('@tuturuuu/ai/credits/model-mapping', () => ({
  toBareModelName: (model: string) => model,
}));

vi.mock('@tuturuuu/ai/credits/resolve-plan-model', () => ({
  PlanModelResolutionError: class PlanModelResolutionError extends Error {
    constructor(
      message: string,
      public readonly status = 400
    ) {
      super(message);
    }
  },
  resolvePlanModel: vi.fn(),
}));

vi.mock('@tuturuuu/ai/memory', () => ({
  withAiMemory: vi.fn((model: unknown) => model),
}));

vi.mock('@tuturuuu/utils/email/client', () => ({
  isExactTuturuuuDotComEmail: vi.fn(() => false),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

vi.mock('@/lib/education/access', () => ({
  checkEducationWorkspaceAccess: mocks.checkEducationWorkspaceAccess,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/lib/valsea-audio-storage-policy', () => ({
  isValseaAudioStoragePath: vi.fn(() => true),
  MAX_VALSEA_AUDIO_UPLOAD_BYTES: 10 * 1024 * 1024,
  validateFinalizedValseaAudioUpload: vi.fn(() => ({ ok: true })),
}));

vi.mock('@tuturuuu/storage-core/workspace-storage-provider', () => ({
  createWorkspaceStorageSignedReadUrl: vi.fn(),
}));

vi.mock('./voice-grading', () => ({
  gradeVoicePronunciation: vi.fn(),
}));

function createRequest(method: 'GET' | 'POST') {
  return new NextRequest(
    'http://localhost/api/v1/workspaces/ws-1/education/valsea',
    {
      body: method === 'POST' ? JSON.stringify({ transcript: 'hello' }) : null,
      method,
    }
  );
}

async function callRoute(method: 'GET' | 'POST') {
  const route = await import('./route');
  const handler = method === 'GET' ? route.GET : route.POST;

  return handler(createRequest(method), {
    params: Promise.resolve({ wsId: 'ws-1' }),
  });
}

describe('Valsea classroom route authorization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.withSessionAuth.mockImplementation(
      (handler: ValseaHandler) =>
        async (
          request: NextRequest,
          context: { params: Promise<{ wsId: string }> }
        ) =>
          handler(
            request,
            {
              supabase: {},
              user: { id: 'user-1' },
            },
            await context.params
          )
    );
    mocks.checkEducationWorkspaceAccess.mockResolvedValue({
      normalizedWsId: 'ws-1',
      ok: true,
      sbAdmin: {},
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('blocks members without education feature access before provider calls', async () => {
    mocks.checkEducationWorkspaceAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    });

    const response = await callRoute('POST');

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions',
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.checkEducationWorkspaceAccess).toHaveBeenCalledWith({
      context: {
        supabase: {},
        user: { id: 'user-1' },
      },
      wsId: 'ws-1',
    });
  });

  it('returns config for members with education feature access', async () => {
    const response = await callRoute('GET');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      hasServerKey: false,
      pronunciationDefaultModel: 'local-whisper-large-v3-turbo',
    });
  });
});
