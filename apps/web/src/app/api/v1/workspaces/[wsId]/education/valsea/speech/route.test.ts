import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SpeechHandler = (
  request: NextRequest,
  context: {
    supabase: Record<string, never>;
    user: { id: string };
  },
  params: { wsId: string }
) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  randomUUID: vi.fn(() => 'audio-id'),
  serverLogger: {
    error: vi.fn(),
  },
  uploadWorkspaceStorageFileDirect: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
  withSessionAuth: vi.fn(),
}));

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();

  return {
    ...actual,
    default: actual,
    randomUUID: mocks.randomUUID,
  };
});

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

vi.mock('@/lib/workspace-storage-provider', () => ({
  uploadWorkspaceStorageFileDirect: mocks.uploadWorkspaceStorageFileDirect,
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
}));

function createRequest() {
  return new NextRequest(
    'http://localhost/api/v1/workspaces/ws-1/education/valsea/speech',
    {
      body: JSON.stringify({
        language: 'english',
        pace: 1,
        text: 'Hello class',
        voiceId: 'en_US-lessac-high',
      }),
      method: 'POST',
    }
  );
}

async function postSpeech() {
  const { POST } = await import('./route');
  return POST(createRequest(), {
    params: Promise.resolve({ wsId: 'ws-1' }),
  });
}

describe('Valsea speech route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.withSessionAuth.mockImplementation(
      (handler: SpeechHandler) =>
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
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.uploadWorkspaceStorageFileDirect.mockResolvedValue({
      path: 'education/valsea/audio/mira.wav',
    });
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns a generic message for upstream local speech failures', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          detail:
            'Could not download Piper asset https://token:secret@example.com/voice.onnx',
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 503,
        }
      )
    );

    const response = await postSpeech();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({ message: 'Local speech synthesis failed' });
    expect(JSON.stringify(payload)).not.toContain('token:secret');
    expect(mocks.uploadWorkspaceStorageFileDirect).not.toHaveBeenCalled();
    expect(mocks.serverLogger.error).toHaveBeenCalledWith(
      'Local speech synthesis upstream failed',
      {
        hasPublicDetail: true,
        status: 503,
      }
    );
  });

  it('omits internal upstream endpoint and trace details from successful responses', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          audioBase64: Buffer.from('audio').toString('base64'),
          contentType: 'audio/wav',
          model: 'en_US-lessac-high',
          trace: {
            dataDir: '/root/.cache/piper',
            modelPath: '/root/.cache/piper/en_US-lessac-high.onnx',
          },
          voiceId: 'en_US-lessac-high',
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    );

    const response = await postSpeech();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.trace).toEqual({
      durationMs: expect.any(Number),
      engine: 'piper',
      model: 'en_US-lessac-high',
      provider: 'local-model',
      voiceId: 'en_US-lessac-high',
    });
    expect(payload.trace).not.toHaveProperty('endpoint');
    expect(payload.trace).not.toHaveProperty('response');
    expect(JSON.stringify(payload.trace)).not.toContain(
      'pronunciation-assessor'
    );
    expect(JSON.stringify(payload.trace)).not.toContain('/root/.cache/piper');
  });
});
