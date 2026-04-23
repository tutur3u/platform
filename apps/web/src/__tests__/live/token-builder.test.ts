import { Modality } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { buildLiveConnectConfig } from '../../lib/live/token-builder';

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
});
