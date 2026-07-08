import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { NextRequest } from 'next/server';

describe('GET /api/v1/vocabulary/images scraper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 when query parameter is missing', async () => {
    const request = new NextRequest('http://localhost/api/v1/vocabulary/images');
    const response = await GET(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.message).toContain('Query parameter q is required');
  });

  it('scrapes and returns image results successfully from mocked DuckDuckGo responses', async () => {
    const mockHtml = `
      <html>
        <head>
          <script>
            vqd='test-vqd-token-123';
          </script>
        </head>
      </html>
    `;

    const mockJsonResponse = {
      results: [
        {
          image: 'https://example.com/original1.jpg',
          thumbnail: 'https://example.com/thumb1.jpg',
          title: 'Title 1',
        },
        {
          image: 'https://example.com/original2.jpg',
          thumbnail: 'https://example.com/thumb2.jpg',
          title: 'Title 2',
        },
      ],
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    // First call: search page for VQD token
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => mockHtml,
    } as Response);

    // Second call: image search JSON endpoint
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockJsonResponse,
    } as Response);

    const request = new NextRequest(
      'http://localhost/api/v1/vocabulary/images?q=eat'
    );
    const response = await GET(request);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.results).toHaveLength(2);
    expect(data.results[0]).toEqual({
      image: 'https://example.com/original1.jpg',
      thumbnail: 'https://example.com/thumb1.jpg',
      title: 'Title 1',
    });
    expect(data.results[1]).toEqual({
      image: 'https://example.com/original2.jpg',
      thumbnail: 'https://example.com/thumb2.jpg',
      title: 'Title 2',
    });
  });

  it('returns 502 if VQD extraction fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<html>No VQD here</html>',
    } as Response);

    const request = new NextRequest(
      'http://localhost/api/v1/vocabulary/images?q=test'
    );
    const response = await GET(request);
    expect(response.status).toBe(502);

    const data = await response.json();
    expect(data.message).toContain('Failed to extract token from search engine');
  });
});
