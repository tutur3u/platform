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
});
