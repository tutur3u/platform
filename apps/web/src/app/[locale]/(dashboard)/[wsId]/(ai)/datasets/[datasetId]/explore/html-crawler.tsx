'use client';

interface PageProgress {
  pageNumber: number;
  progress: number;
  status: 'pending' | 'fetching' | 'processing' | 'complete' | 'error';
  articleCount?: number;
  fetchedArticles?: number;
}

interface HtmlCrawlerProps {
  url: string;
  htmlIds: string[];
  // eslint-disable-next-line no-unused-vars
  onProgress: (progress: number, status: string) => void;
  // eslint-disable-next-line no-unused-vars
  onUrlFetch?: (url: string, success: boolean) => void;
  // eslint-disable-next-line no-unused-vars
  onQueueUpdate?: (urls: string[]) => void;
  // eslint-disable-next-line no-unused-vars
  onPageProgress?: (progress: PageProgress) => void;
  // eslint-disable-next-line no-unused-vars
  onTotalPages?: (pages: number) => void;
  // eslint-disable-next-line no-unused-vars
  onUrlProgress?: (url: string, progress: number, subStatus?: string) => void;
}

interface ParsedHtmlId {
  columnName: string;
  selector: string;
  isMultiple: boolean;
  subSelector?: string;
  pageId?: string; // For element IDs on article pages
  attribute?: string;
}

interface HtmlPreviewData {
  url: string;
  columnName: string;
  selector: string;
  subSelector?: string;
  attribute?: string;
  sampleData?: string[];
}

export class HtmlCrawler {
  private baseUrl: string = '';
  private currentCallback?: HtmlCrawlerProps;
  private urlCache: Map<string, Document> = new Map();
  private inProgressFetches: Map<string, Promise<Document | null>> = new Map();
  private rateLimiter: {
    queue: Array<() => Promise<void>>;
    isProcessing: boolean;
  } = {
    queue: [],
    isProcessing: false,
  };

  private async processFetchQueue() {
    if (this.rateLimiter.isProcessing) return;
    this.rateLimiter.isProcessing = true;

    while (this.rateLimiter.queue.length > 0) {
      const task = this.rateLimiter.queue.shift();
      if (task) {
        await task();
        // Add delay between requests to prevent overloading
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    this.rateLimiter.isProcessing = false;
  }

  private async fetchWithRateLimit(url: string): Promise<Response> {
    return new Promise((resolve, reject) => {
      this.rateLimiter.queue.push(async () => {
        try {
          const response = await fetch(
            `/api/proxy?url=${encodeURIComponent(url)}`
          );
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
      this.processFetchQueue();
    });
  }

  private parseHtmlId(htmlId: string): ParsedHtmlId {
    // Format: "{{COLUMN_NAME}}:selector[]?->subSelector{attribute}->#id"
    const match = htmlId.match(
      /{{(.+?)}}:(.+?)(?:\[\])?(?:->(.+?))?(?:{(.+?)})?$/
    );
    if (!match) throw new Error(`Invalid HTML ID format: ${htmlId}`);

    const [, columnName, selector, subSelector, attribute] = match;

    // Split subSelector if it contains an ID selector
    let finalSubSelector = subSelector;
    let pageId = '';

    if (subSelector?.includes('->#')) {
      pageId = subSelector.split('->#')?.[1]?.trim() || '';
    }

    return {
      columnName: columnName?.trim() || '',
      selector: selector?.trim() || '',
      isMultiple: htmlId.includes('[]'),
      subSelector: finalSubSelector?.trim(),
      pageId: pageId || '', // Store the ID selector separately
      attribute: attribute?.trim(),
    };
  }

  private async fetchAndParse(url: string): Promise<Document | null> {
    // Check cache first
    const cachedDoc = this.urlCache.get(url);
    if (cachedDoc) {
      console.log('📦 Cache hit:', url);
      this.currentCallback?.onUrlProgress?.(url, 100, 'Loaded from cache');
      return cachedDoc;
    }

    // Check if there's already a fetch in progress for this URL
    const inProgressFetch = this.inProgressFetches.get(url);
    if (inProgressFetch) {
      console.log('⏳ Reusing in-progress fetch:', url);
      return inProgressFetch;
    }

    try {
      // Create a new fetch promise
      const fetchPromise = (async () => {
        this.currentCallback?.onUrlFetch?.(url, true);
        this.currentCallback?.onUrlProgress?.(url, 10, 'Starting fetch');
        console.log('📥 Fetching:', url);

        const response = await this.fetchWithRateLimit(url);
        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);
        this.currentCallback?.onUrlProgress?.(url, 50, 'Downloaded');

        const html = await response.text();
        this.currentCallback?.onUrlProgress?.(url, 75, 'Parsing HTML');

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Cache the parsed document
        this.urlCache.set(url, doc);
        this.currentCallback?.onUrlProgress?.(url, 100, 'Complete');

        // Remove from in-progress fetches
        this.inProgressFetches.delete(url);

        return doc;
      })();

      // Store the promise in the in-progress map
      this.inProgressFetches.set(url, fetchPromise);
      return fetchPromise;
    } catch (e) {
      console.error('❌ Error fetching page:', url, e);
      this.currentCallback?.onUrlFetch?.(url, false);
      this.inProgressFetches.delete(url);
      return null;
    }
  }

  private extractContent(element: Element, parsedId: ParsedHtmlId): string {
    if (!element) return '';

    try {
      // Special handling for href attributes
      if (parsedId.attribute === 'href') {
        const href = element.getAttribute('href');
        if (href) {
          return href.startsWith('..')
            ? new URL(href.replace('..', ''), this.baseUrl).toString()
            : new URL(href, this.baseUrl).toString();
        }
      }

      // Handle other attributes or text content
      if (parsedId.attribute) {
        return element.getAttribute(parsedId.attribute) || '';
      }

      return element.textContent?.trim() || '';
    } catch (e) {
      console.warn('Error extracting content:', e);
      return '';
    }
  }

  // Add method to fetch article preview
  private async getArticlePreview(
    url: string,
    selectors: ParsedHtmlId[]
  ): Promise<Record<string, string>> {
    const doc = await this.fetchAndParse(url);
    if (!doc) return {};

    const data: Record<string, string> = {};
    for (const selector of selectors) {
      if (selector.pageId) {
        const element = doc.getElementById(selector.pageId);
        if (element) {
          data[selector.columnName] = element.textContent?.trim() || '';
        }
      }
    }
    return data;
  }

  private generatePaginationUrls(baseUrl: string, maxPage: number): string[] {
    const urls: string[] = [];
    const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);

    for (let i = 1; i <= maxPage; i++) {
      const pageUrl =
        i === 1
          ? baseUrl // First page uses the original URL
          : new URL(`p${i}_9Lua-gao.html`, baseDir).toString();
      urls.push(pageUrl);
    }

    return urls;
  }

  private extractMaxPageNumber(pagingElement: Element): number {
    // Get all page links
    const pageLinks = Array.from(pagingElement.querySelectorAll('a'));

    // Find the last numbered link
    const lastLink = pageLinks[pageLinks.length - 1];
    if (!lastLink) return 1;

    // Extract the page number from href (p367_9Lua-gao.html -> 367)
    const match = lastLink.getAttribute('href')?.match(/p(\d+)_/);
    return match ? parseInt(match?.[1] || '1') : 1;
  }

  private async fetchPaginatedUrls(
    url: string,
    // eslint-disable-next-line no-unused-vars
    onProgress: (progress: number, status: string) => void
  ): Promise<string[]> {
    // Fetch first page to analyze pagination
    const doc = await this.fetchAndParse(url);
    if (!doc) return [url];

    const pagingElement = doc.querySelector('.paging');
    if (!pagingElement) return [url];

    // Extract max page number and generate all URLs
    const maxPage = this.extractMaxPageNumber(pagingElement);
    const allUrls = this.generatePaginationUrls(url, maxPage);

    console.log(`📚 Generated ${allUrls.length} pagination URLs`);
    onProgress(10, `Found ${allUrls.length} pages to process`);

    // Update the queue with all URLs at once
    this.currentCallback?.onQueueUpdate?.(allUrls);

    return allUrls;
  }

  async getPreview(props: HtmlCrawlerProps): Promise<{
    mainPage: HtmlPreviewData[];
    articlePreviews: Record<string, string>[];
  }> {
    this.currentCallback = props;
    try {
      return await this._getPreview(props);
    } finally {
      this.currentCallback = undefined;
    }
  }

  private async _getPreview({
    url,
    htmlIds,
    onProgress,
  }: HtmlCrawlerProps): Promise<{
    mainPage: HtmlPreviewData[];
    articlePreviews: Record<string, string>[];
  }> {
    this.baseUrl = url;

    const paginatedUrls = await this.fetchPaginatedUrls(url, onProgress);
    console.log(`Found ${paginatedUrls.length} paginated URLs`);

    const mainPagePreviews: HtmlPreviewData[] = [];
    const articlePreviews: Record<string, string>[] = [];

    for (const pageUrl of paginatedUrls) {
      if (!pageUrl) continue;
      const mainDoc = await this.fetchAndParse(pageUrl);
      if (!mainDoc) continue;

      const newsContainer = mainDoc.querySelector('.news');
      if (!newsContainer) continue;

      const newsItems = Array.from(newsContainer.querySelectorAll('a.item'));

      for (const id of htmlIds) {
        const parsed = this.parseHtmlId(id);
        const previewData: HtmlPreviewData = {
          url,
          columnName: parsed.columnName,
          selector: parsed.selector,
          subSelector: parsed.subSelector,
          attribute: parsed.attribute,
          sampleData: [],
        };

        if (!parsed.pageId) {
          // Handle main page content first
          if (parsed.attribute === 'href' && parsed.subSelector === 'a') {
            newsItems.forEach((item) => {
              const href = item.getAttribute('href');
              if (href) {
                const fullUrl = href.startsWith('..')
                  ? new URL(href.replace('..', ''), this.baseUrl).toString()
                  : new URL(href, this.baseUrl).toString();
                previewData.sampleData?.push(fullUrl);
              }
            });
          } else {
            // Other main page selectors
            newsItems.forEach((item) => {
              const elements = parsed.isMultiple
                ? item.querySelectorAll(parsed.selector)
                : [item.querySelector(parsed.selector)];

              elements.forEach((el) => {
                if (!el) return;
                const content = this.extractContent(el, parsed);
                if (content) previewData.sampleData?.push(content);
              });
            });
          }
        } else if (parsed.pageId) {
          // Handle page-specific content
          for (const item of newsItems) {
            const href = item.getAttribute('href');
            if (!href) continue;

            const articleUrl = href.startsWith('..')
              ? new URL(href.replace('..', ''), this.baseUrl).toString()
              : new URL(href, this.baseUrl).toString();

            const articleData = await this.getArticlePreview(articleUrl, [
              parsed,
            ]);
            if (articleData[parsed.columnName]) {
              const content = articleData[parsed.columnName];
              if (content) {
                previewData.sampleData?.push(content);
              }
              articlePreviews.push({ ...articleData, URL: articleUrl });
            }
          }
        }

        mainPagePreviews.push(previewData);
      }
    }

    return { mainPage: mainPagePreviews, articlePreviews };
  }

  private async getArticleUrls(newsItems: Element[]): Promise<string[]> {
    const uniqueUrls = new Set<string>();

    for (const item of newsItems) {
      const href = item.getAttribute('href');
      if (!href) continue;

      const articleUrl = href.startsWith('..')
        ? new URL(href.replace('..', ''), this.baseUrl).toString()
        : new URL(href, this.baseUrl).toString();

      uniqueUrls.add(articleUrl);
    }

    return Array.from(uniqueUrls);
  }

  async crawl(props: HtmlCrawlerProps): Promise<any[]> {
    this.currentCallback = props;
    try {
      return await this._crawl(props);
    } finally {
      this.currentCallback = undefined;
    }
  }

  private async _crawl({
    url,
    htmlIds,
    onProgress,
    onPageProgress,
    onTotalPages,
  }: HtmlCrawlerProps): Promise<any[]> {
    this.baseUrl = url;
    const results: any[] = [];
    const parsedIds = htmlIds.map((id) => this.parseHtmlId(id));
    const needsPageContent = parsedIds.some((p) => p.pageId);

    try {
      onProgress(5, 'Fetching paginated URLs...');
      const paginatedUrls = await this.fetchPaginatedUrls(url, onProgress);
      onTotalPages?.(paginatedUrls.length);

      console.log(`Found ${paginatedUrls.length} paginated URLs`);

      // Pre-collect all article URLs
      const allArticleUrls: string[] = [];
      for (const pageUrl of paginatedUrls) {
        const mainDoc = await this.fetchAndParse(pageUrl);
        if (!mainDoc) continue;

        const newsContainer = mainDoc.querySelector('.news');
        if (!newsContainer) continue;

        const newsItems = Array.from(newsContainer.querySelectorAll('a.item'));
        const pageArticleUrls = await this.getArticleUrls(newsItems);
        allArticleUrls.push(...pageArticleUrls);
      }

      // Remove duplicates
      const uniqueArticleUrls = [...new Set(allArticleUrls)];
      console.log(
        `Found ${uniqueArticleUrls.length} unique articles (${allArticleUrls.length - uniqueArticleUrls.length} duplicates removed)`
      );

      // Pre-fetch all article pages if needed
      if (needsPageContent) {
        await Promise.all(
          uniqueArticleUrls.map(async (articleUrl) => {
            await this.fetchAndParse(articleUrl);
          })
        );
      }

      // Process pages and articles
      for (let pageIndex = 0; pageIndex < paginatedUrls.length; pageIndex++) {
        const pageUrl = paginatedUrls[pageIndex];
        const pageNumber = pageIndex + 1;

        // Initialize page progress
        onPageProgress?.({
          pageNumber,
          progress: 0,
          status: 'fetching',
        });

        onProgress(
          10 + Math.round((pageIndex / paginatedUrls.length) * 90),
          `Processing page ${pageNumber} of ${paginatedUrls.length}`
        );

        if (!pageUrl) {
          onPageProgress?.({
            pageNumber,
            progress: 100,
            status: 'error',
          });
          continue;
        }

        const mainDoc = await this.fetchAndParse(pageUrl);
        if (!mainDoc) {
          onPageProgress?.({
            pageNumber,
            progress: 100,
            status: 'error',
          });
          continue;
        }

        onPageProgress?.({
          pageNumber,
          progress: 30,
          status: 'processing',
        });

        const newsContainer = mainDoc.querySelector('.news');
        if (!newsContainer) continue;

        const newsItems = Array.from(newsContainer.querySelectorAll('a.item'));
        const totalArticles = newsItems.length;
        let processedArticles = 0;

        onPageProgress?.({
          pageNumber,
          progress: 40,
          status: 'processing',
          articleCount: totalArticles,
          fetchedArticles: 0,
        });

        // Process only unique articles on this page
        const pageArticleUrls = await this.getArticleUrls(newsItems);

        for (const articleUrl of pageArticleUrls) {
          const rowData: Record<string, string> = {};

          // Process main page content
          for (const parsed of parsedIds) {
            if (!parsed.pageId) {
              // Handle main page content
              if (parsed.attribute === 'href' && parsed.subSelector === 'a') {
                rowData[parsed.columnName] = articleUrl;
              } else {
                for (const item of newsItems) {
                  const elements = parsed.isMultiple
                    ? item?.querySelectorAll(parsed.selector)
                    : [item?.querySelector(parsed.selector)];

                  elements?.forEach((el) => {
                    if (!el) return;
                    const content = this.extractContent(el, parsed);
                    if (content) rowData[parsed.columnName] = content;
                  });
                }
              }
            }
          }

          // Process article-specific content using cached data
          if (needsPageContent) {
            const articleDoc = this.urlCache.get(articleUrl);
            if (!articleDoc) continue;

            for (const parsed of parsedIds) {
              if (parsed.pageId) {
                const element = articleDoc.getElementById(parsed.pageId);
                if (element) {
                  rowData[parsed.columnName] =
                    element.textContent?.trim() || '';
                }
              }
            }
          }

          processedArticles++;
          onPageProgress?.({
            pageNumber,
            progress: 40 + Math.round((processedArticles / totalArticles) * 60),
            status: 'processing',
            articleCount: totalArticles,
            fetchedArticles: processedArticles,
          });

          if (Object.keys(rowData).length > 0) {
            results.push(rowData);
          }
        }

        // Mark page as complete
        onPageProgress?.({
          pageNumber,
          progress: 100,
          status: 'complete',
          articleCount: totalArticles,
          fetchedArticles: processedArticles,
        });
      }

      onProgress(100, `Successfully processed ${results.length} items`);
      return results;
    } catch (error) {
      console.error('Crawling error:', error);
      throw error;
    }
  }
}
