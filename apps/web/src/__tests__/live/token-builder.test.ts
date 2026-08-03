import { Modality } from '@google/genai';
import { describe, expect, it } from 'vitest';
import {
  buildCreateAuthTokenConfig,
  buildLiveConnectConfig,
} from '../../lib/live/token-builder';

describe('buildLiveConnectConfig', () => {
  it('defaults Gemini Live tokens to audio output only', () => {
    const config = buildLiveConnectConfig({
      model: 'gemini-3.1-flash-live-preview',
    });

    expect(config.model).toBe('gemini-3.1-flash-live-preview');
    expect(config.config?.responseModalities).toEqual([Modality.AUDIO]);
    expect(config.config?.inputAudioTranscription).toEqual({});
    expect(config.config?.outputAudioTranscription).toEqual({});
  });

  it('uses the documented v1alpha auth token config shape', () => {
    const config = buildCreateAuthTokenConfig({
      model: 'gemini-3.1-flash-live-preview',
    });

    expect(config?.uses).toBe(1);
    expect(config?.httpOptions).toEqual({ apiVersion: 'v1alpha' });
    expect(config?.lockAdditionalFields).toEqual([]);
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
});
