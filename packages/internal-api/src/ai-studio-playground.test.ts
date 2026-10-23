import { describe, expect, it, vi } from 'vitest';
import { getAiStudioPublicModels } from './ai-studio-playground';

function requestedUrl(baseUrl: string) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(Response.json({ error: 'nope' }, { status: 500 }));
  return getAiStudioPublicModels('secret', { baseUrl, fetch: fetchMock })
    .catch(() => undefined)
    .then(() => fetchMock.mock.calls[0]?.[0]);
}

describe('AI Studio playground URLs', () => {
  it('trims trailing slashes from the public API base URL', async () => {
    await expect(requestedUrl('https://ai.tuturuuu.com')).resolves.toBe(
      'https://ai.tuturuuu.com/v1/models'
    );
    await expect(requestedUrl('https://ai.tuturuuu.com///')).resolves.toBe(
      'https://ai.tuturuuu.com/v1/models'
    );
  });

  it('trims long slash runs in linear time', async () => {
    const baseUrl = `${'/'.repeat(100_000)}a`;
    const startedAt = performance.now();

    await expect(requestedUrl(baseUrl)).resolves.toBe(`${baseUrl}/v1/models`);
    expect(performance.now() - startedAt).toBeLessThan(200);
  });
});
