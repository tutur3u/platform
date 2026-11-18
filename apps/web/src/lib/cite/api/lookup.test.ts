import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CitationLookupError } from '@/lib/cite/metadata-network';
import { POST } from './lookup';

const lookup = vi.hoisted(() => vi.fn());
const budget = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('@/lib/cite/metadata', () => ({ lookupCitation: lookup }));
vi.mock('@/lib/cite/lookup-budget', () => ({ reserveCitationLookup: budget }));

function request(body: string, contentType = 'application/json') {
  return new Request('https://tuturuuu.com/api/v1/cite/lookup', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
}
beforeEach(() => {
  lookup.mockReset();
  budget.mockReset();
  budget.mockResolvedValue({ kind: 'allowed' });
});

describe('POST citation lookup', () => {
  it('waits for a counted reservation before starting an outbound lookup', async () => {
    const reservation = Promise.withResolvers<{ kind: 'allowed' }>();
    budget.mockReturnValue(reservation.promise);
    lookup.mockResolvedValue({
      fields: { type: 'book', title: 'Synthetic source', authors: [] },
    });
    const pending = POST(request('{"input":"10.5555/test"}'));
    expect(budget).toHaveBeenCalledTimes(1);
    expect(lookup).not.toHaveBeenCalled();
    reservation.resolve({ kind: 'allowed' });
    expect((await pending).status).toBe(200);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('returns 503 before lookup when the shared budget store is unreachable', async () => {
    budget.mockResolvedValue({ kind: 'rejected', status: 503, retryAfter: 60 });
    const response = await POST(request('{"input":"10.5555/test"}'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'LOOKUP_UNAVAILABLE' });
    expect(response.headers.get('retry-after')).toBe('60');
    expect(lookup).not.toHaveBeenCalled();
  });
  it.each([429, 503])(
    'refuses lookup when the distributed budget rejects with %s',
    async (status) => {
      budget.mockResolvedValue({ kind: 'rejected', status, retryAfter: 60 });
      const response = await POST(request('{"input":"10.5555/test"}'));
      expect(response.status).toBe(status);
      expect(response.headers.get('retry-after')).toBe('60');
      expect(lookup).not.toHaveBeenCalled();
    }
  );
  it('returns synthetic lookup metadata with cache disabled', async () => {
    const receipt = {
      fields: { type: 'book', title: 'Synthetic source', authors: [] },
      source: 'openlibrary',
      needsReview: true,
    };
    lookup.mockResolvedValue(receipt);
    const response = await POST(
      request(JSON.stringify({ input: '9781234567897' }))
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(receipt);
  });

  it.each([
    '{',
    '{}',
    '{"input":123}',
    '{"input":""}',
    '{"input":"10.5555/test","url":"http://localhost"}',
  ])('rejects invalid input %s before lookup', async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('caps request bytes even without content-length', async () => {
    expect(
      (await POST(request(JSON.stringify({ input: 'x'.repeat(5000) })))).status
    ).toBe(413);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('rejects form submissions', async () => {
    expect(
      (
        await POST(
          request('input=10.5555/test', 'application/x-www-form-urlencoded')
        )
      ).status
    ).toBe(415);
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([
    ['TIMEOUT', 504],
    ['NOT_FOUND', 404],
    ['UPSTREAM_ERROR', 502],
    ['RESPONSE_TOO_LARGE', 413],
  ] as const)(
    'preserves stable %s errors without provider details',
    async (code, status) => {
      lookup.mockRejectedValue(new CitationLookupError(code, status));
      const response = await POST(request('{"input":"10.5555/test"}'));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: code });
    }
  );

  it('sanitizes unexpected failure details', async () => {
    lookup.mockRejectedValue(new Error('private implementation detail'));
    const response = await POST(request('{"input":"10.5555/test"}'));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'UPSTREAM_ERROR' });
  });
});
