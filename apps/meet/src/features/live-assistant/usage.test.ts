import { MediaModality } from '@google/genai';
import { expect, it } from 'vitest';
import {
  accumulateLiveUsage,
  EMPTY_GEMINI_LIVE_USAGE,
} from '../../../cloudflare/live/usage';

it('adds the rebilled context of each response instead of keeping only the last turn', () => {
  const first = accumulateLiveUsage(EMPTY_GEMINI_LIVE_USAGE, {
    promptTokenCount: 100,
    promptTokensDetails: [{ modality: MediaModality.TEXT, tokenCount: 100 }],
    responseTokenCount: 20,
    responseTokensDetails: [{ modality: MediaModality.AUDIO, tokenCount: 20 }],
  });
  const second = accumulateLiveUsage(first.usage, {
    promptTokenCount: 150,
    promptTokensDetails: [{ modality: MediaModality.TEXT, tokenCount: 150 }],
    responseTokenCount: 30,
    responseTokensDetails: [{ modality: MediaModality.AUDIO, tokenCount: 30 }],
  });
  expect(second.usage.inputTextTokens).toBe(250);
  expect(second.usage.outputAudioTokens).toBe(50);
  expect(second.incomplete).toBe(false);
});

it('marks missing modality pricing as incomplete', () => {
  expect(
    accumulateLiveUsage(EMPTY_GEMINI_LIVE_USAGE, {
      promptTokenCount: 100,
      responseTokenCount: 20,
    }).incomplete
  ).toBe(true);
});

it('marks missing tool usage allocation incomplete even when ordinary prompt tokens are covered', () => {
  expect(
    accumulateLiveUsage(EMPTY_GEMINI_LIVE_USAGE, {
      promptTokenCount: 10,
      promptTokensDetails: [{ modality: MediaModality.TEXT, tokenCount: 10 }],
      toolUsePromptTokenCount: 20,
    }).incomplete
  ).toBe(true);
});

it('includes each tool modality without masking missing ordinary prompt usage', () => {
  const result = accumulateLiveUsage(EMPTY_GEMINI_LIVE_USAGE, {
    promptTokenCount: 10,
    toolUsePromptTokenCount: 20,
    toolUsePromptTokensDetails: [
      { modality: MediaModality.AUDIO, tokenCount: 20 },
    ],
  });
  expect(result.usage.inputAudioTokens).toBe(20);
  expect(result.incomplete).toBe(true);
});
