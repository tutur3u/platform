import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HtmlCrawler } from '../app/[locale]/(dashboard)/[wsId]/(ai)/datasets/[datasetId]/explore/crawlers/html-crawler';

describe('HtmlCrawler', () => {
  let crawler: HtmlCrawler;

  beforeEach(() => {
    crawler = new HtmlCrawler();

    // Create base mock response
    const mockResponse = {
      ok: true,
      headers: new Headers({
        'content-type': 'text/html',
      }),
      text: () => Promise.resolve(''),
    };

    global.fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(mockResponse));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('getPreview fetches and parses HTML correctly', async () => {
    const mockHtml = `
      <div class="news">
        <a class="item" href="/article1">
          <h3>Title 1</h3>
          <p>Description 1</p>
        </a>
      </div>
    `;

    (global.fetch as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve(mockHtml),
      })
    );

    const previewResult = await crawler.getPreview({
      url: 'https://test.com',
      htmlIds: ['{{Title}}:h3', '{{Description}}:p'],
      onProgress: vi.fn(),
    });

    expect(previewResult.mainPage).toBeDefined();
    expect(previewResult.mainPage.length).toBe(2); // Two fields: Title and Description
    expect(global.fetch).toHaveBeenCalled();
  });

  test('crawl handles pagination correctly', async () => {
    const mockHtmlPage1 = `
      <div class="news">
        <a class="item" href="/article1">
          <h3>Title 1</h3>
        </a>
        <div class="paging">
          <a href="p2_9Lua-gao.html">2</a>
        </div>
      </div>
    `;

    const mockHtmlPage2 = `
      <div class="news">
        <a class="item" href="/article2">
          <h3>Title 2</h3>
        </a>
      </div>
    `;

    let callCount = 0;
    (global.fetch as any).mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () =>
          Promise.resolve(callCount === 1 ? mockHtmlPage1 : mockHtmlPage2),
      });
    });

    const results = await crawler.crawl({
      url: 'https://test.com', // Use https:// protocol
      htmlIds: ['{{Title}}:h3'],
      onProgress: vi.fn(),
      maxPages: 2,
    });

    expect(results).toHaveLength(2);
    expect(results[0].Title).toBe('Title 1');
    expect(results[1].Title).toBe('Title 2');
  });

  test('handles fetch errors gracefully', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    await expect(
      crawler.crawl({
        url: 'http://test.com',
        htmlIds: ['{{Title}}:h3'],
        onProgress: vi.fn(),
      })
    ).rejects.toThrow();
  });

  test('respects maxArticles limit', async () => {
    const mockHtml = `
      <div class="news">
        <a class="item" href="/article1">
          <h3>Title 1</h3>
        </a>
        <a class="item" href="/article2">
          <h3>Title 2</h3>
        </a>
        <a class="item" href="/article3">
          <h3>Title 3</h3>
        </a>
      </div>
    `;

    (global.fetch as any).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve(mockHtml),
      })
    );

    const results = await crawler.crawl({
      url: 'https://test.com',
      htmlIds: ['{{Title}}:h3'],
      maxArticles: 2,
      onProgress: vi.fn(),
    });

    expect(results).toHaveLength(2);
    expect(results[0].Title).toBe('Title 1');
    expect(results[1].Title).toBe('Title 2');
  });

  test('handles retry mechanism correctly', async () => {
    const mockHtml = `
      <div class="news">
        <a class="item" href="/article1">
          <h3>Title 1</h3>
        </a>
      </div>
    `;

    // Mock fetch to fail once then succeed
    global.fetch = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error('Network error')))
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          headers: new Headers({
            'content-type': 'text/html',
            'x-retry-attempt': '1',
          }),
          text: () => Promise.resolve(mockHtml),
        })
      );

    const results = await crawler.crawl({
      url: 'http://test.com',
      htmlIds: ['{{Title}}:h3'],
      onProgress: vi.fn(),
    });

    expect(results).toHaveLength(1);
    expect(results[0].Title).toBe('Title 1');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('handles rate limiting correctly', async () => {
    const mockHtml = `
      <div class="news">
        <a class="item" href="/article1">
          <h3>Title 1</h3>
        </a>
      </div>
    `;

    (global.fetch as any).mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            headers: new Headers({ 'content-type': 'text/html' }),
            text: () => Promise.resolve(mockHtml),
          });
        }, 100); // Reduced delay for testing
      });
    });

    const results = await crawler.crawl({
      url: 'https://test.com',
      htmlIds: ['{{Title}}:h3'],
      onProgress: vi.fn(),
    });

    expect(results).toHaveLength(1);
    expect(results[0].Title).toBe('Title 1');
  }, 15000); // Increased timeout

  test('respects maxArticles limit with pagination', async () => {
    const mockHtml1 = `
      <div class="news">
        <a class="item" href="/article1">
          <h3>Title 1</h3>
        </a>
        <a class="item" href="/article2">
          <h3>Title 2</h3>
        </a>
        <div class="paging">
          <a href="p2_9Lua-gao.html">2</a>
        </div>
      </div>
    `;

    const mockHtml2 = `
      <div class="news">
        <a class="item" href="/article3">
          <h3>Title 3</h3>
        </a>
      </div>
    `;

    let pageCount = 0;
    (global.fetch as any).mockImplementation(() => {
      pageCount++;
      return Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve(pageCount === 1 ? mockHtml1 : mockHtml2),
      });
    });

    const results = await crawler.crawl({
      url: 'http://test.com',
      htmlIds: ['{{Title}}:h3'],
      maxArticles: 2,
      onProgress: vi.fn(),
    });

    expect(results).toHaveLength(2);
    expect(results[0].Title).toBe('Title 1');
    expect(results[1].Title).toBe('Title 2');
  }, 15000); // Increased timeout

  test('handles complex selectors correctly', async () => {
    const mockHtml = `
      <div class="news">
        <a class="item" href="/article1">
          <h3>Title 1</h3>
          <div class="meta">
            <span class="date">2024-01-01</span>
            <span class="author">Author 1</span>
          </div>
        </a>
      </div>
    `;

    global.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: () => Promise.resolve(mockHtml),
      })
    );

    const results = await crawler.crawl({
      url: 'http://test.com',
      htmlIds: [
        '{{Title}}:h3',
        '{{Date}}:.meta .date',
        '{{Author}}:.meta .author',
      ],
      onProgress: vi.fn(),
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      Title: 'Title 1',
      Date: '2024-01-01',
      Author: 'Author 1',
    });
  });
});
