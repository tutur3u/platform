import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepareMeteredExecution: vi.fn(),
  settleMeteredExecution: vi.fn(),
}));

vi.mock('./public-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./public-api')>()),
  prepareMeteredExecution: mocks.prepareMeteredExecution,
  settleMeteredExecution: mocks.settleMeteredExecution,
}));

import { executeSpeechRequest, speechRequestSchema } from './speech-execution';

describe('external speech execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key';
    mocks.prepareMeteredExecution.mockResolvedValue({
      credential: {
        appId: 'cybershield35',
        kind: 'external-app',
        workspaceId: 'workspace',
      },
      modelId: 'google/gemini-3.1-flash-tts-preview',
      requestId: 'request-id',
      runId: 'run-id',
      startedAt: Date.now(),
    });
  });

  it('requires the TTS scope and returns downloadable WAV audio', async () => {
    const pcm = Buffer.alloc(48_000);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          outputAudio: { data: pcm.toString('base64') },
        })
      )
    );

    const response = await executeSpeechRequest(
      new Request('https://ai.tuturuuu.com/v1/audio/speech', {
        method: 'POST',
      }),
      speechRequestSchema.parse({
        input: 'Xin chào Việt Nam.',
        voice: 'Kore',
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/wav');
    expect(response.headers.get('content-disposition')).toContain(
      'attachment;'
    );
    expect(mocks.prepareMeteredExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredExternalScope: 'tts:use',
      })
    );
    expect(mocks.settleMeteredExecution).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'succeeded',
        usage: expect.objectContaining({ outputTokens: 25 }),
      })
    );
  });

  it('uses Tuturuuu AI Gateway with deployment OIDC when Google has no key', async () => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    process.env.VERCEL_OIDC_TOKEN = 'vercel-oidc-token';
    const wav = Buffer.from('RIFF-test-wave');
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        audio: wav.toString('base64'),
        warnings: [],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await executeSpeechRequest(
      new Request('https://ai.tuturuuu.com/v1/audio/speech', {
        method: 'POST',
      }),
      speechRequestSchema.parse({
        input: 'Xin chào Việt Nam.',
        instructions: 'Đọc tự nhiên và rõ ràng.',
        voice: 'Kore',
      })
    );

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(wav);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://ai-gateway.vercel.sh/v4/ai/speech-model',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer vercel-oidc-token',
          'ai-model-id': 'openai/tts-1-hd',
        }),
      })
    );
    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(requestBody).toMatchObject({
      language: 'vi',
      outputFormat: 'wav',
      text: 'Xin chào Việt Nam.',
    });
    expect(mocks.prepareMeteredExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          provider_route: 'tuturuuu-gateway',
        }),
        modelId: 'google/gemini-3.1-flash-tts-preview',
        requiredExternalScope: 'tts:use',
      })
    );
  });
});
