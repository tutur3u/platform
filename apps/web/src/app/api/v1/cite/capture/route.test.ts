import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const capture = vi.hoisted(() => vi.fn());
const budget = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/cite/capture', () => ({ captureCitation: capture }));
vi.mock('@/lib/cite/lookup-budget', () => ({ reserveCitationLookup: budget }));
const request = (input: string) =>
  new Request('https://tuturuuu.com/api/v1/cite/capture', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input }),
  });
beforeEach(() => {
  budget.mockReset();
  capture.mockReset();
  budget.mockResolvedValue({ kind: 'allowed' });
});

describe('POST citation capture', () => {
  it('awaits the same distributed reservation before any cache or source work', async () => {
    const reservation = Promise.withResolvers<{ kind: 'allowed' }>();
    budget.mockReturnValue(reservation.promise);
    capture.mockResolvedValue({
      kind: 'candidates',
      candidates: [],
      needsReview: true,
      source: 'openalex',
      receipt: { operations: 1, elapsedMs: 10 },
    });
    const response = POST(request('title: Synthetic title'));
    expect(capture).not.toHaveBeenCalled();
    reservation.resolve({ kind: 'allowed' });
    const result = await response;
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      kind: 'candidates',
      candidates: [],
    });
    expect(result.headers.get('cache-control')).toBe('no-store');
  });

  it.each([429, 503])(
    'refuses capture and cache access when budget rejects%s',
    async (status) => {
      budget.mockResolvedValue({ kind: 'rejected', status, retryAfter: 60 });
      const result = await POST(request('10.5555/synthetic'));
      expect(result.status).toBe(status);
      expect(result.headers.get('retry-after')).toBe('60');
      expect(capture).not.toHaveBeenCalled();
    }
  );

  it('returns manual drafts without fabricating a canonical work', async () => {
    capture.mockResolvedValue({
      kind: 'manual',
      fields: {
        type: 'webpage',
        title: '',
        authors: [],
        URL: 'https://publisher.example/source',
      },
      source: 'manual',
      needsReview: true,
      receipt: { operations: 0, elapsedMs: 0 },
    });
    const result = await POST(request('https://publisher.example/source'));
    const body = await result.json();
    expect(body).toMatchObject({ kind: 'manual', fields: { title: '' } });
    expect(body).not.toHaveProperty('work');
  });

  it('bounds streamed input bytes before starting capture', async () => {
    expect((await POST(request('x'.repeat(5000)))).status).toBe(413);
    expect(capture).not.toHaveBeenCalled();
  });

  it('does not disclose unexpected provider errors', async () => {
    capture.mockRejectedValue(new Error('private query or provider detail'));
    const result = await POST(request('10.5555/synthetic'));
    expect(result.status).toBe(502);
    expect(await result.json()).toEqual({ error: 'UPSTREAM_ERROR' });
  });
});
