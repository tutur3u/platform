import { CiteWorkSchema } from '@tuturuuu/cite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CITE_FORMAT_MAX_BYTES,
  handleCitationFormat,
  handleCitationValidate,
  reserveCitationFormatting,
} from './format-api';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: vi.fn() }));
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: vi.fn(),
}));

const work = CiteWorkSchema.parse({
  id: 'synthetic-book',
  type: 'book',
  title: 'Synthetic maps',
  authors: [{ kind: 'person', family: 'Vale', given: 'Mira' }],
  issued: { year: 2024 },
  publisher: 'Fictional Press',
  publisherPlace: 'Example City',
});
const payload = {
  style: 'apa',
  works: [work],
  citations: [{ id: 'first', items: [{ workId: work.id }] }],
};
const emptyResult = { citations: [], bibliography: [], issues: [] };
const authenticate = async () =>
  ({ ok: true, actorId: 'verified-actor' }) as const;
const reserve = async () => ({ kind: 'allowed' }) as const;
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://tuturuuu.com/api/v1/cite/format', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
afterEach(() => vi.useRealTimers());

describe('bounded deterministic citation requests', () => {
  it('reserves the authenticated actor budget before invoking the engine', async () => {
    const format = vi.fn(() => emptyResult);
    const reservation = Promise.withResolvers<{ kind: 'allowed' }>();
    const budget = vi.fn(() => reservation.promise);
    const pending = handleCitationFormat(
      request(payload, {
        'x-user-id': 'forged-actor',
        'cf-connecting-ip': '1.2.3.4',
      }),
      { authenticate, reserve: budget, format }
    );
    await Promise.resolve();
    expect(budget).toHaveBeenCalledWith('verified-actor');
    expect(format).not.toHaveBeenCalled();
    reservation.resolve({ kind: 'allowed' });
    expect((await pending).status).toBe(200);
    expect(format).toHaveBeenCalledTimes(1);
  });

  it.each([429, 503] as const)(
    'stops before body reads or engine work for budget status %s',
    async (status) => {
      const read = vi.fn();
      const format = vi.fn(() => emptyResult);
      const input = request(payload);
      const body = input.body;
      if (!body) throw new Error('Fixture body missing');
      vi.spyOn(body, 'getReader').mockImplementation(read);
      const response = await handleCitationFormat(input, {
        authenticate,
        reserve: async () => ({ kind: 'rejected', status, retryAfter: 29 }),
        format,
      });
      expect(response.status).toBe(status);
      expect(response.headers.get('retry-after')).toBe('29');
      expect(read).not.toHaveBeenCalled();
      expect(format).not.toHaveBeenCalled();
    }
  );

  it('does not reserve or read input for an unauthenticated request', async () => {
    const budget = vi.fn(reserve);
    const response = await handleCitationFormat(request(payload), {
      authenticate: async () => ({
        ok: false,
        response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
      }),
      reserve: budget,
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(budget).not.toHaveBeenCalled();
  });

  it.each([
    { ...payload, style: 'apa-7' },
    { ...payload, actorId: 'forged' },
    { ...payload, works: [{ ...work, unknown: true }] },
    {
      ...payload,
      works: [{ ...work, provenance: { ...work.provenance, unknown: true } }],
    },
    {
      ...payload,
      works: [
        {
          ...work,
          authors: [{ kind: 'person', family: 'Vale', unknown: true }],
        },
      ],
    },
    {
      ...payload,
      works: [
        {
          ...work,
          aiGenerated: { modelName: 'Synthetic Model', unknown: true },
        },
      ],
    },
    { ...payload, works: [work, work] },
    {
      ...payload,
      citations: [{ id: 'missing', items: [{ workId: 'unknown' }] }],
    },
    {
      ...payload,
      citations: [{ id: 'first', items: [{ workId: work.id, unknown: true }] }],
    },
    { ...payload, citations: [...payload.citations, ...payload.citations] },
    {
      ...payload,
      works: Array.from({ length: 101 }, (_, i) => ({
        ...work,
        id: `work-${i}`,
      })),
    },
    {
      ...payload,
      citations: Array.from({ length: 201 }, (_, i) => ({
        id: `cite-${i}`,
        items: [{ workId: work.id }],
      })),
    },
    {
      ...payload,
      citations: [
        {
          id: 'crowded',
          items: Array.from({ length: 11 }, () => ({ workId: work.id })),
        },
      ],
    },
  ])(
    'rejects malformed or oversized schema data before engine execution',
    async (body) => {
      const format = vi.fn(() => emptyResult);
      expect(
        (
          await handleCitationFormat(request(body), {
            authenticate,
            reserve,
            format,
          })
        ).status
      ).toBe(400);
      expect(format).not.toHaveBeenCalled();
    }
  );

  it('accepts the exact work, occurrence and cluster item limits', async () => {
    const works = Array.from({ length: 100 }, (_, i) => ({
      ...work,
      id: `work-${i}`,
    }));
    const citations = Array.from({ length: 200 }, (_, i) => ({
      id: `cite-${i}`,
      items: works.slice(0, 10).map(({ id }) => ({ workId: id })),
    }));
    const format = vi.fn(() => emptyResult);
    expect(
      (
        await handleCitationFormat(
          request({ style: 'harvard', works, citations }),
          { authenticate, reserve, format }
        )
      ).status
    ).toBe(200);
    expect(format).toHaveBeenCalledTimes(1);
  });

  it('rejects advertised and streamed byte excess, wrong content type and malformed JSON', async () => {
    const format = vi.fn(() => emptyResult);
    expect(
      (
        await handleCitationFormat(
          request(payload, {
            'content-length': String(CITE_FORMAT_MAX_BYTES + 1),
          }),
          { authenticate, reserve, format }
        )
      ).status
    ).toBe(413);
    expect(
      (
        await handleCitationFormat(
          request({ padding: 'x'.repeat(CITE_FORMAT_MAX_BYTES) }),
          { authenticate, reserve, format }
        )
      ).status
    ).toBe(413);
    expect(
      (
        await handleCitationFormat(
          request(payload, { 'content-type': 'text/plain' }),
          { authenticate, reserve, format }
        )
      ).status
    ).toBe(415);
    expect(
      (
        await handleCitationFormat(
          new Request('https://tuturuuu.com/api/v1/cite/format', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{',
          }),
          { authenticate, reserve, format }
        )
      ).status
    ).toBe(400);
    expect(format).not.toHaveBeenCalled();
  });

  it('cancels a stalled body at five seconds without invoking the engine', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const format = vi.fn(() => emptyResult);
    const streamed = request(payload);
    Object.defineProperty(streamed, 'body', {
      value: new ReadableStream<Uint8Array>({ cancel }),
    });
    const pending = handleCitationFormat(streamed, {
      authenticate,
      reserve,
      format,
    });
    await vi.advanceTimersByTimeAsync(5000);
    const response = await pending;
    expect(response.status).toBe(408);
    expect(await response.json()).toEqual({ error: 'TIMEOUT' });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(format).not.toHaveBeenCalled();
  });

  it('cancels an interrupted body and prevents formatting after client abort', async () => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const format = vi.fn(() => emptyResult);
    const streamed = new Request('https://tuturuuu.com/api/v1/cite/format', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    });
    const started = Promise.withResolvers<void>();
    const body: ReadableStream<Uint8Array> = new ReadableStream<Uint8Array>({
      pull() {
        if (body.locked) started.resolve();
      },
      cancel,
    });
    Object.defineProperty(streamed, 'body', {
      value: body,
    });
    const pending = handleCitationFormat(streamed, {
      authenticate,
      reserve,
      format,
    });
    await started.promise;
    controller.abort();
    const response = await pending;
    expect(response.status).toBe(408);
    expect(await response.json()).toEqual({ error: 'REQUEST_ABORTED' });
    expect(format).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('keeps parser and unexpected engine failure details out of responses', async () => {
    const response = await handleCitationFormat(request(payload), {
      authenticate,
      reserve,
      format: () => {
        throw new Error('private source title');
      },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'FORMAT_UNAVAILABLE' });
    const invalid = await handleCitationValidate(
      request({ style: 'apa', work: { ...work, secret: 'private source' } }),
      { authenticate, reserve }
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'INVALID_INPUT' });
  });
});

describe('distributed deterministic citation budget', () => {
  it('uses one atomic reservation with hashed actor keys, shared global key and expiring counters', async () => {
    const evaluate = vi
      .fn<
        (
          script: string,
          keys: string[],
          args: (string | number)[]
        ) => Promise<number>
      >()
      .mockResolvedValue(1);
    const deps = {
      store: async () => ({ eval: evaluate }),
      now: () => 600_000,
    };
    expect(await reserveCitationFormatting('private-actor', deps)).toEqual({
      kind: 'allowed',
    });
    expect(evaluate).toHaveBeenCalledTimes(1);
    const [script, keys, args] = evaluate.mock.calls[0] ?? [];
    expect(script).toContain("redis.call('INCR', KEYS[1])");
    expect(keys).toEqual([
      expect.stringMatching(/^cite:format:\{budget\}:10:actor:[a-f0-9]{64}$/),
      'cite:format:{budget}:10:global',
    ]);
    expect(JSON.stringify(keys)).not.toContain('private-actor');
    expect(args).toEqual([10, 120, 120]);
  });
  it('returns retry timing on rejection and fails closed on missing or unreachable Redis', async () => {
    expect(
      await reserveCitationFormatting('actor', {
        store: async () => ({ eval: async () => 0 }),
        now: () => 619_000,
      })
    ).toEqual({ kind: 'rejected', status: 429, retryAfter: 41 });
    expect(
      await reserveCitationFormatting('actor', { store: async () => null })
    ).toEqual({ kind: 'rejected', status: 503, retryAfter: 60 });
    expect(
      await reserveCitationFormatting('actor', {
        store: async () => {
          throw new Error('Redis unavailable');
        },
      })
    ).toEqual({ kind: 'rejected', status: 503, retryAfter: 60 });
  });
});
