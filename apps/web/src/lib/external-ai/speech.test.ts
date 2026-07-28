import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  beginRun: vi.fn(),
  calculateCost: vi.fn(),
  settleRun: vi.fn(),
}));

vi.mock('@tuturuuu/ai/studio/metering', () => ({
  beginExternalAiStudioRun: mocks.beginRun,
  calculateAiStudioUsageCost: mocks.calculateCost,
  settleExternalAiStudioRun: mocks.settleRun,
}));
vi.mock('./auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth')>();
  return {
    ...actual,
    authenticateExternalAiRequest: mocks.authenticate,
  };
});

import { executeExternalSpeech } from './speech';

const workspaceId = '449cdd3b-121b-40f7-9cee-28f5b582e204';

function request() {
  return new Request('https://tuturuuu.com/api/v1/external-ai/audio/speech', {
    body: JSON.stringify({
      input: 'Đây là giọng đọc tiếng Việt tự nhiên.',
      model: 'google/gemini-3.1-flash-tts-preview',
      response_format: 'wav',
      voice: 'Kore',
    }),
    headers: {
      authorization: 'Bearer ttr_app_test',
      'content-type': 'application/json',
      'x-request-id': 'speech-request-1',
      'x-tuturuuu-workspace-id': workspaceId,
    },
    method: 'POST',
  });
}

describe('executeExternalSpeech', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'central-google-key';
    mocks.authenticate.mockResolvedValue({
      actorId: 'user-1',
      appId: 'cybershield35',
      scopes: ['workspace:session', 'tts:use'],
      workspaceId,
    });
    mocks.beginRun.mockResolvedValue({ runId: 'speech-run-1' });
    mocks.calculateCost.mockResolvedValue({
      billedCredits: 2,
      providerCostUsd: 0.002,
    });
    mocks.settleRun.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });

  it('uses Tuturuuu central Google TTS and returns a downloadable WAV', async () => {
    const pcm = Buffer.from([1, 2, 3, 4, 5, 6]);
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json({
        steps: [
          {
            content: [
              {
                data: pcm.toString('base64'),
                type: 'audio',
              },
            ],
            type: 'model_output',
          },
        ],
      })
    );

    const response = await executeExternalSpeech(request(), fetchImpl);
    const wav = Buffer.from(await response.arrayBuffer());
    const providerCall = fetchImpl.mock.calls[0];
    expect(providerCall).toBeDefined();
    const providerBody = JSON.parse(String(providerCall?.[1]?.body));
    const providerHeaders = new Headers(providerCall?.[1]?.headers);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('speech.wav');
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.subarray(44)).toEqual(pcm);
    expect(providerBody.model).toBe('gemini-3.1-flash-tts-preview');
    expect(providerHeaders.get('Api-Revision')).toBe('2026-05-20');
    expect(providerHeaders.get('x-goog-api-key')).toBe('central-google-key');
    expect(mocks.beginRun).toHaveBeenCalledWith(
      expect.objectContaining({
        externalAppId: 'cybershield35',
        feature: 'text_to_speech',
        modelId: 'google/gemini-3.1-flash-tts-preview',
      })
    );
    expect(mocks.settleRun).toHaveBeenCalledWith(
      expect.objectContaining({
        providerCostUsd: 0.002,
        runId: 'speech-run-1',
        status: 'succeeded',
      })
    );
  });

  it('settles a failed run when Google rejects the request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            code: 400,
            message: 'Invalid speech request.',
            status: 'INVALID_ARGUMENT',
          },
        },
        { status: 400 }
      )
    );
    const response = await executeExternalSpeech(request(), fetchImpl);

    expect(response.status).toBe(502);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(mocks.settleRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'speech-run-1',
        status: 'failed',
      })
    );
  });

  it('retries one transient provider failure', async () => {
    const pcm = Buffer.from([1, 2, 3, 4]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: 503,
              status: 'UNAVAILABLE',
            },
          },
          { status: 503 }
        )
      )
      .mockResolvedValueOnce(
        Response.json({
          output_audio: { data: pcm.toString('base64') },
        })
      );

    const response = await executeExternalSpeech(request(), fetchImpl);

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(mocks.settleRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'speech-run-1',
        status: 'succeeded',
      })
    );
  });
});
