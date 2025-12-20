'use client';

import { BaseCrawler } from './base-crawler';

const activeFetchesRef: {
  current: Array<{ controller: AbortController; url: string }>;
} = {
  current: [],
};

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
  // Add new limit options
  maxPages?: number;
  maxArticles?: number;

  onProgress: (progress: number, status: string) => void;

  onUrlFetch?: (
    url: string,

    success: boolean,

    subPages?: { total: number; processed: number }
  ) => void;

  onQueueUpdate?: (urls: string[]) => void;

  onPageProgress?: (progress: PageProgress) => void;

  onTotalPages?: (pages: number) => void;

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

export class HtmlCrawler extends BaseCrawler {
  constructor(options?: { useProductionProxy?: boolean }) {
    super(options);
  }

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

  // Add retry configuration
  private retryConfig = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2,
  };

  // Add timeout configuration
  private timeoutConfig = {
    fetchTimeout: 30000, // 30 seconds
    parseTimeout: 10000, // 10 seconds
  };

  // Add retry method with exponential backoff
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    attempt: number = 1,
    url?: string
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= this.retryConfig.maxRetries) {
        console.error(
          `❌ Failed after ${attempt} retries${url ? ` for ${url}` : ''}`
        );
        throw error;
      }

      const delay = Math.min(
        this.retryConfig.initialDelay *
          this.retryConfig.backoffFactor ** (attempt - 1),
        this.retryConfig.maxDelay
      );

      console.log(
        `🔄 Retry attempt ${attempt}${url ? ` for ${url}` : ''} after ${delay}ms delay`
      );
      this.currentCallback?.onUrlProgress?.(
        url || '',
        0,
        `Retry attempt ${attempt} of ${this.retryConfig.maxRetries}`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));

      return this.retryWithBackoff(operation, attempt + 1, url);
    }
  }

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
      const timeout = setTimeout(() => {
        reject(
          new Error(
            `Request timed out after ${this.timeoutConfig.fetchTimeout}ms`
          )
        );
      }, this.timeoutConfig.fetchTimeout);

      this.rateLimiter.queue.push(async () => {
        try {
          const response = await this.retryWithBackoff(
            async () => {
              const controller = new AbortController();
              const signal = controller.signal;

              const res = await this.fetchWithProxy(url, { signal });
              if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
              }
              return res;
            },
            1,
            url
          );

          clearTimeout(timeout);
          resolve(response);
        } catch (error) {
          clearTimeout(timeout);
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
    const finalSubSelector = subSelector;
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
    const controller = new AbortController();
    activeFetchesRef.current.push({ controller, url });

    try {
      // Check cache first
      const cachedDoc = this.urlCache.get(url);
      if (cachedDoc) {
        return cachedDoc;
      }

      // Check if there's already a fetch in progress for this URL
      const inProgressFetch = this.inProgressFetches.get(url);
      if (inProgressFetch) {
        return inProgressFetch;
      }

      const fetchPromise = (async () => {
        try {
          const response = await this.fetchWithRateLimit(url);
          const html = await response.text();

          // Parse HTML with timeout
          const parsePromise = new Promise<Document>((resolve, reject) => {
            const parseTimeout = setTimeout(() => {
              reject(new Error('HTML parsing timed out'));
            }, this.timeoutConfig.parseTimeout);

            try {
              const parser = new DOMParser();
              const doc = parser.parseFromString(html, 'text/html');

              if (!doc.querySelector('body')) {
                throw new Error('Invalid HTML document received');
              }

              clearTimeout(parseTimeout);
              resolve(doc);
            } catch (error) {
              clearTimeout(parseTimeout);
              reject(error);
            }
          });

          const doc = await parsePromise;
          this.urlCache.set(url, doc);
          return doc;
        } catch (error) {
          console.error('Error fetching page:', url, error);
          throw error;
        } finally {
          this.inProgressFetches.delete(url);
          activeFetchesRef.current = activeFetchesRef.current.filter(
            (fetch) => fetch.url !== url
          );
        }
      })();

      this.inProgressFetches.set(url, fetchPromise);
      return fetchPromise;
    } catch (error) {
      console.error('Error in fetchAndParse:', error);
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
            ? new URL(href.replace(/\.\./g, ''), this.baseUrl).toString()
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
    const baseDir = new URL('.', baseUrl).toString(); // Fix base directory URL

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
    return match ? parseInt(match?.[1] || '1', 10) : 1;
  }

  private async fetchPaginatedUrls(
    url: string,

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
                  ? new URL(href.replace(/\.\./g, ''), this.baseUrl).toString()
                  : new URL(href, this.baseUrl).toString();
                previewData.sampleData?.push(fullUrl);
              }
            });
          } else {
            // Other main page selectors
            newsItems.forEach((item) => {
              const elements = parsed.isMultiple
                ? item?.querySelectorAll(parsed.selector)
                : [item?.querySelector(parsed.selector)];

              elements?.forEach((el) => {
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
              ? new URL(href.replace(/\.\./g, ''), this.baseUrl).toString()
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
        ? new URL(href.replace(/\.\./g, ''), this.baseUrl).toString()
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
    maxPages,
    maxArticles,
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
      let paginatedUrls = await this.fetchPaginatedUrls(url, onProgress);

      // Apply page limit if specified
      if (maxPages && maxPages > 0) {
        paginatedUrls = paginatedUrls.slice(0, maxPages);
        console.log(`Limited to ${maxPages} pages`);
      }

      onTotalPages?.(paginatedUrls.length);
      console.log(`Processing ${paginatedUrls.length} paginated URLs`);

      // Initialize progress for all pages
      paginatedUrls.forEach((_, index) => {
        onPageProgress?.({
          pageNumber: index + 1,
          progress: 0,
          status: 'pending',
          articleCount: 0,
          fetchedArticles: 0,
        });
      });

      // First pass: Count total articles across all pages
      let totalArticlesAcrossPages = 0;
      const totalArticlesNeeded = maxArticles || Infinity;

      for (let pageIndex = 0; pageIndex < paginatedUrls.length; pageIndex++) {
        const pageUrl = paginatedUrls[pageIndex];
        const pageNumber = pageIndex + 1;

        onPageProgress?.({
          pageNumber,
          progress: 10,
          status: 'fetching',
        });

        if (!pageUrl) continue;

        const mainDoc = await this.fetchAndParse(pageUrl);
        if (!mainDoc) continue;

        const newsContainer = mainDoc.querySelector('.news');
        if (!newsContainer) continue;

        const newsItems = Array.from(newsContainer.querySelectorAll('a.item'));
        const pageArticleCount = Math.min(
          newsItems.length,
          totalArticlesNeeded - totalArticlesAcrossPages
        );
        totalArticlesAcrossPages += pageArticleCount;

        if (totalArticlesAcrossPages >= totalArticlesNeeded) {
          console.log(`Reached article limit of ${maxArticles}`);
          // Adjust paginated URLs to only include necessary pages
          paginatedUrls = paginatedUrls.slice(0, pageIndex + 1);
          onTotalPages?.(paginatedUrls.length);
          break;
        }

        onPageProgress?.({
          pageNumber,
          progress: 20,
          status: 'processing',
          articleCount: pageArticleCount,
          fetchedArticles: 0,
        });
      }

      console.log(`Total articles found: ${totalArticlesAcrossPages}`);
      let processedArticlesTotal = 0;

      // Batch size for article processing
      const BATCH_SIZE = 5;

      // Modify article processing loop
      for (let pageIndex = 0; pageIndex < paginatedUrls.length; pageIndex++) {
        const pageUrl = paginatedUrls[pageIndex];
        const pageNumber = pageIndex + 1;

        if (!pageUrl) continue;

        const mainDoc = await this.fetchAndParse(pageUrl);
        if (!mainDoc) {
          onPageProgress?.({
            pageNumber,
            progress: 100,
            status: 'error',
          });
          continue;
        }

        const newsContainer = mainDoc.querySelector('.news');
        if (!newsContainer) continue;

        const newsItems = Array.from(newsContainer.querySelectorAll('a.item'));
        let pageArticleUrls = await this.getArticleUrls(newsItems);

        // Apply article limit for this page
        if (maxArticles) {
          const remainingArticles = maxArticles - processedArticlesTotal;
          if (remainingArticles <= 0) break;
          pageArticleUrls = pageArticleUrls.slice(0, remainingArticles);
        }

        // Update progress for article fetching
        onPageProgress?.({
          pageNumber,
          progress: 40,
          status: 'processing',
          articleCount: pageArticleUrls.length,
          fetchedArticles: 0,
        });

        // Process articles in batches
        for (let i = 0; i < pageArticleUrls.length; i += BATCH_SIZE) {
          const batch = pageArticleUrls.slice(i, i + BATCH_SIZE);

          // Process batch in parallel but maintain order
          const batchResults = await Promise.all(
            batch.map(async (articleUrl, batchIndex) => {
              const rowData: Record<string, string> = {};
              const articleIndex = i + batchIndex; // Calculate the correct article index

              if (needsPageContent) {
                await this.fetchAndParse(articleUrl);
              }

              // Process article data using the correct index
              for (const parsed of parsedIds) {
                if (!parsed.pageId) {
                  if (
                    parsed.attribute === 'href' &&
                    parsed.subSelector === 'a'
                  ) {
                    rowData[parsed.columnName] = articleUrl;
                  } else {
                    const item = newsItems[articleIndex]; // Use the correct index
                    if (!item) continue;

                    const elements = parsed.isMultiple
                      ? item.querySelectorAll(parsed.selector)
                      : [item.querySelector(parsed.selector)];

                    elements?.forEach((el) => {
                      if (!el) return;
                      const content = this.extractContent(el, parsed);
                      if (content) rowData[parsed.columnName] = content;
                    });
                  }
                }
              }

              // Process article-specific content
              if (needsPageContent) {
                const articleDoc = this.urlCache.get(articleUrl);
                if (!articleDoc) return {};

                for (const parsed of parsedIds) {
                  if (parsed.pageId) {
                    const element = articleDoc?.getElementById(parsed.pageId);
                    if (element) {
                      rowData[parsed.columnName] =
                        element.textContent?.trim() || '';
                    }
                  }
                }
              }

              return rowData;
            })
          );

          // Add batch results to main results
          results.push(
            ...batchResults.filter((row) => Object.keys(row).length > 0)
          );

          // Update progress
          processedArticlesTotal += batch.length;
          onProgress(
            Math.round(
              (processedArticlesTotal / totalArticlesAcrossPages) * 100
            ),
            `Processing article ${processedArticlesTotal} of ${totalArticlesAcrossPages}`
          );
        }

        // Mark page as complete
        onPageProgress?.({
          pageNumber,
          progress: 100,
          status: 'complete',
          articleCount: pageArticleUrls.length,
          fetchedArticles: pageArticleUrls.length,
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
