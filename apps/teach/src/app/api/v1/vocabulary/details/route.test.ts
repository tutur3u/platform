import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown) => handler,
}));

describe('GET /api/v1/vocabulary/details scraper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when word param is missing', async () => {
    const request = new NextRequest(
      'http://localhost/api/v1/vocabulary/details'
    );
    const response = await GET(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.message).toContain('Word query parameter is required');
  });

  it('scrapes Laban details successfully from HTML', async () => {
    const mockHtml = `
      <html>
        <body>
          <div class="word_tab_title_0">
            <h2>eat <span>(v)</span></h2>
            <span class="color-black">/iːt/</span>
          </div>
          <div class="slide_content" rel="0">
            <div class="content">
              <div class="bg-grey bold font-large"><span>động từ</span></div>
              <div class="green bold margin25">ăn</div>
              <div class="bold dot-blue">Phrasal verbs</div>
              <div class="grey bold margin25">nội dung sau ranh giới</div>
              <div class="color-light-blue margin25">We eat dinner together.</div>
            </div>
          </div>
        </body>
      </html>
    `;

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => mockHtml,
    } as Response);

    const request = new NextRequest(
      'http://localhost/api/v1/vocabulary/details?word=eat'
    );
    const response = await GET(request);
    expect(response.status).toBe(200);

    const [requestedUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestedUrl).toBeInstanceOf(URL);
    expect(String(requestedUrl)).toBe(
      'https://dict.laban.vn/find?type=1&query=eat'
    );
    expect(requestInit).toEqual(
      expect.objectContaining({
        next: { revalidate: 3600 },
        signal: expect.any(AbortSignal),
      })
    );

    const data = await response.json();
    expect(data.word).toBe('eat');
    expect(data.pronunciation).toBe('/iːt/');
    expect(data.definition).toBe('động từ: ăn');
    expect(data.examples).toEqual(['We eat dinner together.']);
  });

  it('falls back to empty details if fetch returns non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const request = new NextRequest(
      'http://localhost/api/v1/vocabulary/details?word=example'
    );
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.word).toBe('example');
    expect(data.definition).toBe('');
    expect(data.pronunciation).toBe('');
    expect(data.examples).toEqual([]);
  });
});
