import { Modality, ThinkingLevel } from '@google/genai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCreateAuthTokenConfig,
  buildLiveConnectConfig,
  createConstrainedLiveToken,
} from '../../lib/live/token-builder';

describe('buildLiveConnectConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each(['gemini-3.8-live', 'gemini-3.8-live-extended-thinking'])(
    'uses the expanded context window for %s',
    (model) => {
      expect(
        buildLiveConnectConfig({ model }).config?.contextWindowCompression
      ).toEqual({
        triggerTokens: '100000',
        slidingWindow: { targetTokens: '64000' },
      });
    }
  );

  it('omits unsupported Flash reasoning and uses high background reasoning for Pro', () => {
    expect(
      buildLiveConnectConfig({
        model: 'gemini-3.8-live',
        thinkingLevel: ThinkingLevel.HIGH,
      }).config
    ).not.toHaveProperty('thinkingConfig');
    expect(
      buildLiveConnectConfig({ model: 'gemini-3.8-live-extended-thinking' })
        .config?.thinkingConfig
    ).toEqual({ thinkingLevel: ThinkingLevel.HIGH });
    expect(
      buildLiveConnectConfig({
        model: 'gemini-3.8-live-extended-thinking',
        thinkingLevel: ThinkingLevel.MINIMAL,
      }).config?.thinkingConfig
    ).toEqual({ thinkingLevel: ThinkingLevel.HIGH });
  });

  it('defaults Gemini Live tokens to audio output only', () => {
    const config = buildLiveConnectConfig({
      model: 'gemini-3.1-flash-live-preview',
    });

    expect(config.model).toBe('gemini-3.1-flash-live-preview');
    expect(config.config?.responseModalities).toEqual([Modality.AUDIO]);
    expect(config.config?.inputAudioTranscription).toEqual({});
    expect(config.config?.outputAudioTranscription).toEqual({});
  });

  it('uses the documented v1beta auth token config shape', () => {
    const config = buildCreateAuthTokenConfig({
      model: 'gemini-3.1-flash-live-preview',
    });

    expect(config?.uses).toBe(1);
    expect(config?.httpOptions).toEqual({ apiVersion: 'v1beta' });
    expect(config).not.toHaveProperty('lockAdditionalFields');
    expect(
      new Date(config?.expireTime ?? 0).getTime() - Date.now()
    ).toBeGreaterThan(4 * 60 * 1000);
    expect(
      new Date(config?.expireTime ?? 0).getTime() - Date.now()
    ).toBeLessThanOrEqual(5 * 60 * 1000);
    expect(config?.liveConnectConstraints?.model).toBe(
      'gemini-3.1-flash-live-preview'
    );
    expect(config?.liveConnectConstraints?.config?.responseModalities).toEqual([
      Modality.AUDIO,
    ]);
    expect(
      config?.liveConnectConstraints?.config?.contextWindowCompression
    ).toEqual({
      triggerTokens: '25000',
      slidingWindow: { targetTokens: '8000' },
    });
  });

  it('does not serialize an invalid field mask for repeated tool constraints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ name: 'auth_tokens/test' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-api-key');

    await createConstrainedLiveToken({
      model: 'gemini-3.1-flash-live-preview',
      tools: [
        { functionDeclarations: [{ name: 'first_tool' }] },
        { googleSearch: {} },
      ],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(request?.body));

    expect(body.fieldMask).toBeUndefined();
    expect(body.bidiGenerateContentSetup.tools).toHaveLength(2);
  });
});
