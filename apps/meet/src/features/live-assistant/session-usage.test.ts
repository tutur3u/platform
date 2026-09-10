import type { LiveServerMessage } from '@google/genai/web';
import { expect, it } from 'vitest';
import type { SavedSession } from '../../../cloudflare/live/session-state';
import {
  markInterruptedUsage,
  observeSessionUsage,
} from '../../../cloudflare/live/session-usage';
import { EMPTY_GEMINI_LIVE_USAGE } from '../../../cloudflare/live/usage';

function saved() {
  return {
    billing: { usage: { ...EMPTY_GEMINI_LIVE_USAGE }, incomplete: true },
  } as SavedSession;
}
it('counts final usage during shutdown and clears a fully covered pending turn', () => {
  const state = saved();
  observeSessionUsage(state, {
    serverContent: {
      modelTurn: {
        parts: [{ inlineData: { data: 'AAAA', mimeType: 'audio/pcm' } }],
      },
    },
  } as LiveServerMessage);
  expect(state.pendingUsage).toBe(true);
  observeSessionUsage(state, {
    usageMetadata: {
      promptTokenCount: 10,
      promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 10 }],
      responseTokenCount: 5,
      responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 5 }],
    },
  } as LiveServerMessage);
  markInterruptedUsage(state);
  expect(state.billing?.usage.outputAudioTokens).toBe(5);
  expect(state.billing?.incomplete).toBe(false);
});
it('preserves a coverage gap across later successful usage events', () => {
  const state = saved();
  state.pendingUsage = true;
  markInterruptedUsage(state);
  observeSessionUsage(state, {
    usageMetadata: { promptTokenCount: 0, responseTokenCount: 0 },
  } as LiveServerMessage);
  expect(state.billing?.incomplete).toBe(true);
});

it('keeps a known search lower bound and flags missing grounding query counts', () => {
  const state = saved();
  observeSessionUsage(state, {
    serverContent: { groundingMetadata: {} },
  } as LiveServerMessage);
  expect(state.billing?.usage.searchQueries).toBe(1);
  expect(state.billing?.incomplete).toBe(true);
});

it('marks an interrupted output-transcription-only response incomplete', () => {
  const state = saved();
  state.billing!.incomplete = false;
  observeSessionUsage(state, {
    serverContent: { outputTranscription: { text: 'Hello' } },
  } as LiveServerMessage);
  markInterruptedUsage(state);
  expect(state.billing?.incomplete).toBe(true);
});
