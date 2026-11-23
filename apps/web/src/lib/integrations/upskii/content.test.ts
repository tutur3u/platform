import { describe, expect, it } from 'vitest';
import {
  fetchUpskiiContent,
  sanitizeUpskiiItems,
  upskiiApiOrigin,
} from './content';

const ORIGIN = 'https://app.upskii.com';
const item = (overrides: Record<string, unknown> = {}) => ({
  classId: 'c-1',
  id: 'l-1',
  kind: 'lesson',
  title: 'Phân số',
  updatedAt: '2026-11-24T00:00:00.000Z',
  url: `${ORIGIN}/classes/c-1/lessons/l-1`,
  ...overrides,
});

function answer(body: unknown, status = 200) {
  const calls: { init: RequestInit; url: string }[] = [];
  const fetchImpl = (async (url: URL, init: RequestInit) => {
    calls.push({ init, url: url.toString() });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe('upskiiApiOrigin', () => {
  it('pins production to the canonical Upskii host', () => {
    expect(
      upskiiApiOrigin({
        NODE_ENV: 'production',
        UPSKII_API_ORIGIN: 'https://evil.example',
      })
    ).toBe(ORIGIN);
  });

  it('accepts only an http(s) override outside production', () => {
    expect(
      upskiiApiOrigin({
        NODE_ENV: 'development',
        UPSKII_API_ORIGIN: 'http://localhost:3002/x',
      })
    ).toBe('http://localhost:3002');
    expect(
      upskiiApiOrigin({
        NODE_ENV: 'development',
        UPSKII_API_ORIGIN: 'javascript:alert(1)',
      })
    ).toBe(ORIGIN);
  });
});

describe('sanitizeUpskiiItems', () => {
  it("keeps only links on Upskii's exact origin", () => {
    const items = sanitizeUpskiiItems(
      {
        items: [
          item(),
          item({ id: 'js', url: 'javascript:alert(1)' }),
          item({ id: 'other', url: 'https://evil.example/classes/c-1' }),
          item({ id: 'http', url: 'http://app.upskii.com/classes/c-1' }),
          item({ id: 'creds', url: 'https://a:b@app.upskii.com/classes' }),
          item({
            id: 'lookalike',
            url: 'https://app.upskii.com.evil.example/',
          }),
          { id: 'malformed' },
        ],
      },
      ORIGIN
    );
    expect(items?.map((entry) => entry.id)).toEqual(['l-1']);
  });

  it('caps titles and the number of items', () => {
    const items = sanitizeUpskiiItems(
      {
        items: Array.from({ length: 150 }, (_, index) =>
          item({ id: `l-${index}`, title: 'x'.repeat(500) })
        ),
      },
      ORIGIN
    );
    expect(items).toHaveLength(100);
    expect(items?.[0]?.title).toHaveLength(300);
  });

  it('rejects a body that is not a listing', () => {
    expect(sanitizeUpskiiItems({ nope: true }, ORIGIN)).toBeNull();
  });
});

describe('fetchUpskiiContent', () => {
  it('calls the pinned origin with the read token and no redirects', async () => {
    const { calls, fetchImpl } = answer({ items: [item()] });
    const result = await fetchUpskiiContent({
      classId: 'c-1',
      fetchImpl,
      kind: 'lessons',
      origin: ORIGIN,
      token: 'ttr_app_read',
    });
    expect(result).toMatchObject({ ok: true });
    expect(calls[0]?.url).toBe(
      `${ORIGIN}/api/upskii/integrations/tuturuuu/v1/lessons?classId=c-1`
    );
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe(
      'Bearer ttr_app_read'
    );
    expect(calls[0]?.init.redirect).toBe('error');
  });

  it.each([
    [401, 'NOT_LINKED', 404],
    [403, 'SCOPE_NOT_GRANTED', 403],
    [404, 'CLASS_NOT_FOUND', 404],
    [500, 'UPSKII_UNAVAILABLE', 502],
  ])('maps Upskii %i to %s', async (status, code, mapped) => {
    const { fetchImpl } = answer({}, status);
    expect(
      await fetchUpskiiContent({
        classId: null,
        fetchImpl,
        kind: 'classes',
        origin: ORIGIN,
        token: 't',
      })
    ).toEqual({ code, ok: false, status: mapped });
  });

  it('reports a network failure as unavailable', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch;
    expect(
      await fetchUpskiiContent({
        classId: null,
        fetchImpl,
        kind: 'classes',
        origin: ORIGIN,
        token: 't',
      })
    ).toEqual({ code: 'UPSKII_UNAVAILABLE', ok: false, status: 502 });
  });
});
