import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));

describe('GET /api/v1/vocabulary/suggestions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps Laban autocomplete URLs on the Laban origin', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          suggestions: [
            {
              select: 'eat',
              link: 'https://evil.example/dictionary/eat',
              data: '<span class="fl">eat</span> <span class="fr">/iːt/</span><p>ăn, dùng bữa</p>',
            },
          ],
        }),
    } as Response);

    const request = new NextRequest(
      'http://localhost/api/v1/vocabulary/suggestions?q=eat'
    );
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.suggestions).toEqual([
      {
        beta: false,
        definition: 'ăn, dùng bữa',
        pronunciation: '/iːt/',
        url: 'https://dict.laban.vn/find?type=1&query=eat',
        word: 'eat',
      },
    ]);
  });

  it('returns normalized autocomplete suggestions from Laban response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          suggestions: [
            {
              select: 'eat',
              link: '/find?type=1&query=eat',
              data: '<span class="fl">eat</span> <span class="fr">/iːt/</span><p>ăn, dùng bữa</p>',
            },
          ],
        }),
    } as Response);

    const request = new NextRequest(
      'http://localhost/api/v1/vocabulary/suggestions?q=eat'
    );
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.suggestions).toEqual([
      {
        beta: false,
        definition: 'ăn, dùng bữa',
        pronunciation: '/iːt/',
        url: 'https://dict.laban.vn/find?type=1&query=eat',
        word: 'eat',
      },
    ]);
  });

  it('keeps valid items when another autocomplete item is malformed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          suggestions: [
            {
              select: { unexpected: true },
              link: 'http://[',
              data: 42,
            },
            {
              select: 'eat',
              link: '/find?type=1&query=eat',
              data: '<span class="fl">eat</span><p>ăn</p>',
            },
          ],
        }),
    } as Response);

    const response = await GET(
      new NextRequest('http://localhost/api/v1/vocabulary/suggestions?q=eat')
    );

    await expect(response.json()).resolves.toEqual({
      suggestions: [
        {
          beta: false,
          definition: 'ăn',
          url: 'https://dict.laban.vn/find?type=1&query=eat',
          word: 'eat',
        },
      ],
    });
  });

  it.each([
    {
      label: 'upstream request fails',
      response: { ok: false, status: 503 } as Response,
    },
    {
      label: 'upstream response is empty',
      response: {
        ok: true,
        status: 200,
        text: async () => '',
      } as Response,
    },
  ])('returns a bounded find fallback when $label', async ({ response }) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);

    const result = await GET(
      new NextRequest('http://localhost/api/v1/vocabulary/suggestions?q=eat')
    );

    await expect(result.json()).resolves.toEqual({
      suggestions: [
        {
          beta: false,
          url: 'https://dict.laban.vn/find?type=1&query=eat',
          word: 'eat',
        },
      ],
    });
  });
});
