import { describe, expect, it } from 'vitest';
import { resolveFallbackChatAiModelId } from './chat-ai-models';

describe('resolveFallbackChatAiModelId', () => {
  it('keeps the current model when it is available', () => {
    expect(
      resolveFallbackChatAiModelId({
        currentModelId: 'google/gemini-3.1-flash-lite',
        models: [
          { value: 'google/gemini-3.1-flash-lite' },
          { value: 'openai/gpt-5' },
        ],
      })
    ).toBeNull();
  });

  it('selects the first available model when the current model is unavailable', () => {
    expect(
      resolveFallbackChatAiModelId({
        currentModelId: 'google/gemini-3-flash',
        models: [
          { value: 'google/gemini-3.1-flash-lite' },
          { value: 'openai/gpt-5' },
        ],
      })
    ).toBe('google/gemini-3.1-flash-lite');
  });

  it('does not select a fallback when no models are available', () => {
    expect(
      resolveFallbackChatAiModelId({
        currentModelId: 'google/gemini-3-flash',
        models: [],
      })
    ).toBeNull();
  });
});
