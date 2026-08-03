import type { UsageMetadata } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { normalizeGeminiLiveUsage } from './usage';

describe('normalizeGeminiLiveUsage', () => {
  it('keeps modality buckets separate and adds tool prompt text once', () => {
    const result = normalizeGeminiLiveUsage(
      {
        promptTokensDetails: [
          { modality: 'AUDIO', tokenCount: 100 },
          { modality: 'TEXT', tokenCount: 20 },
          { modality: 'IMAGE', tokenCount: 10 },
          { modality: 'VIDEO', tokenCount: 5 },
        ],
        responseTokensDetails: [
          { modality: 'AUDIO', tokenCount: 80 },
          { modality: 'TEXT', tokenCount: 12 },
        ],
        thoughtsTokenCount: 7,
        toolUsePromptTokensDetails: [{ modality: 'TEXT', tokenCount: 3 }],
      } as UsageMetadata,
      2
    );

    expect(result).toEqual({
      inputAudioTokens: 100,
      inputImageTokens: 10,
      inputTextTokens: 23,
      inputVideoTokens: 5,
      outputAudioTokens: 80,
      outputTextTokens: 12,
      searchQueries: 2,
      thinkingTokens: 7,
    });
  });
});
