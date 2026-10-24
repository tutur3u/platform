import { describe, expect, it, vi } from 'vitest';
import { getAiStudioPublicModels } from './ai-studio-playground';

describe('AI Studio public API base URL', () => {
  it('trims trailing slashes from the configured base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [] }));

    await getAiStudioPublicModels('secret', {
      baseUrl: 'https://ai.example.test///',
      fetch: fetchMock,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://ai.example.test/v1/models'
    );
  });

  it('handles long slash runs in linear time', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    const baseUrl = `https://ai.example.test${'/'.repeat(100_000)}x`;
    const startedAt = performance.now();

    await getAiStudioPublicModels('secret', { baseUrl, fetch: fetchMock });

    expect(performance.now() - startedAt).toBeLessThan(500);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${baseUrl}/v1/models`);
  });
});
