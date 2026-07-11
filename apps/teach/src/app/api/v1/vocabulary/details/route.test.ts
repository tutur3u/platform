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

  it('scrapes the best OED search result definition successfully from mocked HTML', async () => {
    const searchHtml = `
      <html>
        <body>
          <div class="resultsSet">
            <div class="resultsSetItem">
              <h3 class="resultTitle" id="eat_v">
                <span class="hw"><span class="hw">eat, </span><span class="ps">v.</span></span>
              </h3>
              <div class="snippet">transitive. To take into the mouth piecemeal, and…</div>
              <a class="viewEntry resultLink" href="/dictionary/eat_v?tab=meaning_and_use#5936857" title="eat, v.">View entry</a>
            </div>
          </div>
        </body>
      </html>
    `;
    const entryHtml = `
      <html>
        <body>
          <article>
            <h1><span class="hw">eat</span></h1>
            <span class="pronunciation">/iːt/</span>
            <div class="definition">To consume food.</div>
            <blockquote class="quotationText">We eat dinner together.</blockquote>
          </article>
        </body>
      </html>
    `;

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => searchHtml,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => entryHtml,
      } as Response);

    const request = new NextRequest(
      'http://localhost/api/v1/vocabulary/details?word=eat'
    );
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.word).toBe('eat');
    expect(data.pronunciation).toBe('/iːt/');
    expect(data.definition).toBe('To consume food.');
    expect(data.examples).toEqual(['We eat dinner together.']);
  });

  it('falls back to the first OED search result when no exact title matches', async () => {
    const mockHtml = `
      <html>
        <body>
          <div class="resultsSet">
            <div class="resultsSetItem">
              <h3 class="resultTitle" id="oat_n">
                <span class="hw"><span class="hw">oat, </span><span class="ps">n.</span></span>
              </h3>
              <div class="snippet">The cereal which yields this...</div>
              <a class="viewEntry resultLink" href="/dictionary/oat_n" title="oat, n.">View entry</a>
            </div>
          </div>
        </body>
      </html>
    `;

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => mockHtml,
    } as Response);

    const request = new NextRequest(
      'http://localhost/api/v1/vocabulary/details?word=example'
    );
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.word).toBe('oat');
    expect(data.definition).toBe('The cereal which yields this...');
  });
});
