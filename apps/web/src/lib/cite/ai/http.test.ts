import { describe, expect, it, vi } from 'vitest';
import { CitationAiError } from './contracts';
import { citationAiErrorResponse, readCitationFixBody } from './http';

vi.mock('server-only', () => ({}));

describe('citation AI HTTP boundary', () => {
  it('reads bounded JSON and refuses other content types and malformed JSON', async () => {
    const json = (body: string, contentType = 'application/json') =>
      new Request('https://example.test/api/v1/cite/ai/fix-ref', {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body,
      });
    await expect(
      readCitationFixBody(json('{"input":"synthetic"}'))
    ).resolves.toEqual({ input: 'synthetic' });
    await expect(
      readCitationFixBody(json('{}', 'text/plain'))
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', status: 400 });
    await expect(readCitationFixBody(json('{'))).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      status: 400,
    });
    await expect(
      readCitationFixBody(json(JSON.stringify({ input: 'x'.repeat(96001) })))
    ).rejects.toMatchObject({ status: 413 });
  });

  it('returns fixed categories with private no-store and truthful billing status', async () => {
    const response = citationAiErrorResponse(
      new CitationAiError('BILLING_PENDING', 503, 'unknown')
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({
      error: 'BILLING_PENDING',
      billingStatus: 'unknown',
    });
  });

  it('never exposes or logs raw provider detail', async () => {
    const logged = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const response = citationAiErrorResponse(
      new Error('private citation title and URL')
    );
    expect(await response.json()).toEqual({ error: 'AI_UNAVAILABLE' });
    expect(logged).toHaveBeenCalledExactlyOnceWith('cite_ai_unavailable');
    logged.mockRestore();
  });
});
