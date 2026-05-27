import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchGatewayModelsPage,
  fetchGatewayProviders,
} from '../mira-gateway-models';

describe('mira gateway models helpers', () => {
  const fetchMock = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    fetchMock.mockReset();
  });

  it('derives provider summaries from the API catalog response', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
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
        pagination: { limit: 100, page: 1, total: 2 },
      }),
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

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/infrastructure/ai/models?enabled=true&format=paginated&limit=100&page=1&type=language',
      { cache: 'no-store' }
    );
  });

  it('requests provider pages with server-side search and pagination', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
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
        ],
        pagination: { limit: 1, page: 1, total: 2 },
      }),
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

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/infrastructure/ai/models?enabled=true&format=paginated&limit=1&page=1&type=language&provider=google&q=pro',
      { cache: 'no-store' }
    );
  });

  it('fetches later server pages for load-more requests', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [],
        pagination: { limit: 5, page: 2, total: 5 },
      }),
    });

    await fetchGatewayModelsPage({
      limit: 5,
      offset: 5,
      provider: 'google',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/infrastructure/ai/models?enabled=true&format=paginated&limit=5&page=2&type=language&provider=google',
      { cache: 'no-store' }
    );
  });
});
