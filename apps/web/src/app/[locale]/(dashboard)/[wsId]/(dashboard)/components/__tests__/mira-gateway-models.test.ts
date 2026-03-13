import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchGatewayModelsPage,
  fetchGatewayProviders,
} from '../mira-gateway-models';

describe('mira gateway models helpers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('derives provider summaries from the API catalog response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          context_window: 1000,
          description: 'Fast model',
          id: 'google/gemini-2.5-flash',
          input_price_per_token: 0,
          is_enabled: true,
          max_tokens: 2000,
          name: 'Gemini 2.5 Flash',
          output_price_per_token: 0,
          provider: 'google',
          tags: ['file-input'],
        },
        {
          context_window: 1000,
          description: 'Thinking model',
          id: 'openai/gpt-5',
          input_price_per_token: 0,
          is_enabled: false,
          max_tokens: 2000,
          name: 'GPT-5',
          output_price_per_token: 0,
          provider: 'openai',
          tags: [],
        },
      ],
    });

    await expect(
      fetchGatewayProviders({
        allowedModels: ['google/gemini-2.5-flash'],
        hideLockedModels: false,
      })
    ).resolves.toMatchObject([
      { provider: 'google', total: 1 },
      { provider: 'openai', total: 1 },
    ]);

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/infrastructure/ai/models', {
      cache: 'no-store',
    });
  });

  it('filters and paginates provider models from the API catalog response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          context_window: 1000,
          description: 'Fast model',
          id: 'google/gemini-2.5-flash',
          input_price_per_token: 0,
          is_enabled: true,
          max_tokens: 2000,
          name: 'Gemini 2.5 Flash',
          output_price_per_token: 0,
          provider: 'google',
          tags: ['file-input'],
        },
        {
          context_window: 1000,
          description: 'Thinking model',
          id: 'google/gemini-2.5-pro',
          input_price_per_token: 0,
          is_enabled: true,
          max_tokens: 2000,
          name: 'Gemini 2.5 Pro',
          output_price_per_token: 0,
          provider: 'google',
          tags: [],
        },
        {
          context_window: 1000,
          description: 'Different provider',
          id: 'openai/gpt-5',
          input_price_per_token: 0,
          is_enabled: true,
          max_tokens: 2000,
          name: 'GPT-5',
          output_price_per_token: 0,
          provider: 'openai',
          tags: [],
        },
      ],
    });

    await expect(
      fetchGatewayModelsPage({
        limit: 1,
        offset: 0,
        provider: 'google',
        search: 'pro',
      })
    ).resolves.toEqual({
      items: [
        {
          context: 1000,
          description: 'Thinking model',
          disabled: false,
          inputPricePerToken: undefined,
          label: 'Gemini 2.5 Pro',
          maxTokens: 2000,
          outputPricePerToken: undefined,
          provider: 'google',
          tags: [],
          value: 'google/gemini-2.5-pro',
        },
      ],
      nextOffset: 1,
    });
  });
});
