import { describe, expect, it, vi } from 'vitest';
import { InternalApiError } from './internal-api-error';
import {
  listUpskiiContent,
  parseUpskiiContentPage,
  UPSKII_CONTENT_MAX_ITEMS,
  upskiiContentErrorCode,
} from './upskii-content';

const item = (id: string, url: unknown, extra: object = {}) => ({
  id,
  title: `Lesson ${id}`,
  url,
  updatedAt: '2026-11-20T00:00:00Z',
  classId: 'c1',
  ...extra,
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('parseUpskiiContentPage', () => {
  it('keeps only links that are https on the exact Upskii origin', () => {
    const page = parseUpskiiContentPage(
      {
        items: [
          item('l1', 'https://upskii.com/classes/c1/lessons/l1'),
          item('l2', 'javascript:alert(1)'),
          item('l3', 'https://upskii.com.evil.test/l3'),
          item('l4', 'http://upskii.com/l4'),
          item('l5', 'https://upskii.com/out?next=https://evil.test'),
          item('l6', { href: 'https://upskii.com/l6' }),
          item('l1', 'https://upskii.com/classes/c1/lessons/l1-copy'),
          item('../x', 'https://upskii.com/x'),
          item('l7', 'https://upskii.com/l7', { title: '   ' }),
        ],
        nextCursor: 'n2',
      },
      'lessons'
    );
    expect(page).toEqual({
      items: [
        {
          id: 'l1',
          title: 'Lesson l1',
          kind: 'lesson',
          url: 'https://upskii.com/classes/c1/lessons/l1',
          updatedAt: '2026-11-20T00:00:00Z',
          classId: 'c1',
        },
      ],
      nextCursor: 'n2',
    });
  });

  it('takes the kind from the request and strips control characters', () => {
    const page = parseUpskiiContentPage(
      {
        items: [
          item('a1', 'https://upskii.com/a1', {
            kind: 'lesson',
            title: 'Quiz\u0000 one\u2028',
            body: '<p>answers</p>',
          }),
        ],
      },
      'assessments'
    );
    expect(page.items[0]).toEqual(
      expect.objectContaining({ kind: 'assessment', title: 'Quiz  one' })
    );
    expect(page.items[0]).not.toHaveProperty('body');
    expect(page.nextCursor).toBeNull();
  });

  it('caps the list and refuses a malformed page', () => {
    const many = Array.from({ length: UPSKII_CONTENT_MAX_ITEMS + 5 }, (_, i) =>
      item(`l${i}`, `https://upskii.com/l${i}`)
    );
    expect(
      parseUpskiiContentPage({ items: many }, 'lessons').items
    ).toHaveLength(UPSKII_CONTENT_MAX_ITEMS);
    expect(() => parseUpskiiContentPage({ items: 'x' }, 'lessons')).toThrow(
      InternalApiError
    );
  });

  it('checks a staging origin exactly when one is pinned', () => {
    const staging = 'https://staging.upskii.com';
    const page = parseUpskiiContentPage(
      { items: [item('a', `${staging}/a`), item('b', 'https://upskii.com/b')] },
      'classes',
      staging
    );
    expect(page.items.map(({ id }) => id)).toEqual(['a']);
  });
});

describe('listUpskiiContent', () => {
  it('reads through the session route with no user or link id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ items: [item('l1', 'https://upskii.com/l1')] })
      );
    await listUpskiiContent(
      { kind: 'lessons', classId: 'c1', cursor: 'n2' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const requested = new URL(String(url));
    expect(requested.origin + requested.pathname).toBe(
      'https://internal.example.com/api/v1/integrations/upskii/content'
    );
    expect(Object.fromEntries(requested.searchParams)).toEqual({
      kind: 'lessons',
      classId: 'c1',
      cursor: 'n2',
    });
    expect(init).toEqual(expect.objectContaining({ cache: 'no-store' }));
  });

  it('omits the class for the class list and requires it otherwise', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [] }));
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };
    await listUpskiiContent({ kind: 'classes', classId: 'c1' }, options);
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).search).toBe(
      '?kind=classes'
    );
    await expect(
      listUpskiiContent({ kind: 'assessments' }, options)
    ).rejects.toMatchObject({ code: 'CLASS_REQUIRED' });
    await expect(
      listUpskiiContent({ kind: 'lessons', classId: '../c1' }, options)
    ).rejects.toMatchObject({ code: 'CLASS_REQUIRED' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('upskiiContentErrorCode', () => {
  it('names the route refusals and folds everything else', () => {
    expect(
      upskiiContentErrorCode(new InternalApiError('x', 404, 'NOT_LINKED'))
    ).toBe('NOT_LINKED');
    expect(
      upskiiContentErrorCode(
        new InternalApiError('x', 403, 'EARLY_ACCESS_ONLY')
      )
    ).toBe('EARLY_ACCESS_ONLY');
    expect(upskiiContentErrorCode(new InternalApiError('x', 404))).toBe(
      'NOT_LINKED'
    );
    expect(upskiiContentErrorCode(new InternalApiError('x', 500, 'BOOM'))).toBe(
      'UNAVAILABLE'
    );
    expect(upskiiContentErrorCode(new Error('offline'))).toBe('UNAVAILABLE');
  });
});
