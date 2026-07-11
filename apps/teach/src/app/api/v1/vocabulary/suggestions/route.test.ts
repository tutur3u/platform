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

  it('keeps OED autocomplete URLs on the OED origin', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify([
          {
            label: 'eat',
            path: 'https://evil.example/dictionary/eat',
          },
        ]),
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
        url: 'https://www.oed.com/search/dictionary/?scope=Entries&q=eat',
        word: 'eat',
      },
    ]);
  });

  it('returns definitions from OED search fallback rows', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '',
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => `
          <html>
            <body>
              <div class="resultsSetItem">
                <h3 class="resultTitle">eat, v.</h3>
                <div class="snippet">To take food into the mouth…</div>
                <a class="viewEntry" href="/dictionary/eat_v" title="eat, v.">
                  View entry
                </a>
              </div>
            </body>
          </html>
        `,
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
        definition: 'To take food into the mouth...',
        url: 'https://www.oed.com/dictionary/eat_v',
        word: 'eat',
      },
    ]);
  });
});
