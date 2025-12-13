import { Modality } from '@google/genai';
import { describe, expect, it } from 'vitest';
import {
  resolveLiveResponseModalities,
  shouldTreatMissingMimeTypeAsAudio,
} from '../../app/[locale]/(dashboard)/[wsId]/(dashboard)/assistant/audio/multimodal-live-client';
import type { LiveConfig } from '../../app/[locale]/(dashboard)/[wsId]/(dashboard)/assistant/multimodal-live';

describe('Gemini Live modality resolution', () => {
  it('prefers config.responseModalities when present', () => {
    const cfg: LiveConfig = {
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      responseModalities: [Modality.TEXT, Modality.AUDIO],
    };

    expect(resolveLiveResponseModalities(cfg)).toEqual([
      Modality.TEXT,
      Modality.AUDIO,
    ]);
  });

  it('falls back to legacy generationConfig.responseModalities (string)', () => {
    const cfg: LiveConfig = {
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      generationConfig: {
        responseModalities: 'audio',
      },
    };

    expect(resolveLiveResponseModalities(cfg)).toEqual([Modality.AUDIO]);
  });

  it('defaults to audio when no modality is configured', () => {
    const cfg: LiveConfig = {
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    };

    expect(resolveLiveResponseModalities(cfg)).toEqual([Modality.AUDIO]);
  });

  it('treats missing inlineData.mimeType as audio only in audio-only mode', () => {
    expect(shouldTreatMissingMimeTypeAsAudio([Modality.AUDIO])).toBe(true);
    expect(
      shouldTreatMissingMimeTypeAsAudio([Modality.AUDIO, Modality.TEXT])
    ).toBe(false);
    expect(shouldTreatMissingMimeTypeAsAudio([Modality.TEXT])).toBe(false);
  });
});
