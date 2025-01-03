'use client';

interface HtmlCrawlerProps {
  url: string;
  htmlIds: string[];
  // eslint-disable-next-line no-unused-vars
  onProgress: (progress: number, status: string) => void;
  // eslint-disable-next-line no-unused-vars
  onUrlFetch?: (url: string, success: boolean) => void;
  // eslint-disable-next-line no-unused-vars
  onQueueUpdate?: (urls: string[]) => void;
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
    try {
      this.currentCallback?.onUrlFetch?.(url, true);
      console.log('📥 Fetching:', url);

      const response = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
      const html = await response.text();
      console.log(`✅ Fetched ${url} (${html.length} bytes)`);

      const parser = new DOMParser();
      return parser.parseFromString(html, 'text/html');
    } catch (e) {
      console.error('❌ Error fetching page:', url, e);
      this.currentCallback?.onUrlFetch?.(url, false);
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

  private async fetchPaginatedUrls(
    url: string,
    // eslint-disable-next-line no-unused-vars
    onProgress: (progress: number, status: string) => void
  ): Promise<string[]> {
    const paginatedUrls: Set<string> = new Set();
    let nextPageUrl = url;
    let pageCount = 0;

    // Notify initial URL
    this.currentCallback?.onQueueUpdate?.([url]);

    while (nextPageUrl) {
      onProgress(10 + pageCount, `Fetching page ${pageCount + 1}`);
      const doc = await this.fetchAndParse(nextPageUrl);
      if (!doc) break;

      paginatedUrls.add(nextPageUrl);
      pageCount++;

      const pagingElement = doc.querySelector('.paging');
      const nextLink = pagingElement?.querySelector('a.active + a');
      if (nextLink) {
        const href = nextLink.getAttribute('href');
        if (href) {
          nextPageUrl = href.startsWith('..')
            ? new URL(href.replace('..', ''), this.baseUrl).toString()
            : new URL(href, this.baseUrl).toString();

          // Update queue with next URL
          this.currentCallback?.onQueueUpdate?.([
            ...Array.from(paginatedUrls),
            nextPageUrl,
          ]);
        } else {
          nextPageUrl = '';
        }
      } else {
        nextPageUrl = '';
      }
    }

    onProgress(10 + pageCount, `Fetched ${pageCount} pages`);
    return Array.from(paginatedUrls);
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
  }: HtmlCrawlerProps): Promise<any[]> {
    this.baseUrl = url;
    const results: any[] = [];
    const parsedIds = htmlIds.map((id) => this.parseHtmlId(id));

    try {
      onProgress(10, 'Fetching paginated URLs...');
      const paginatedUrls = await this.fetchPaginatedUrls(url, onProgress);
      console.log(`Found ${paginatedUrls.length} paginated URLs`);

      for (let pageIndex = 0; pageIndex < paginatedUrls.length; pageIndex++) {
        const pageUrl = paginatedUrls[pageIndex];
        onProgress(
          10 + Math.round((pageIndex / paginatedUrls.length) * 90),
          `Processing page ${pageIndex + 1} of ${paginatedUrls.length}`
        );

        if (!pageUrl) continue;
        const mainDoc = await this.fetchAndParse(pageUrl);
        if (!mainDoc) continue;

        const newsContainer = mainDoc.querySelector('.news');
        if (!newsContainer) continue;

        const newsItems = Array.from(newsContainer.querySelectorAll('a.item'));
        console.log(
          `Found ${newsItems.length} news items on page ${pageIndex + 1}`
        );

        for (let i = 0; i < newsItems.length; i++) {
          const item = newsItems[i];
          const rowData: Record<string, string> = {};
          const href = item?.getAttribute('href');
          if (!href) continue;

          const articleUrl = href.startsWith('..')
            ? new URL(href.replace('..', ''), this.baseUrl).toString()
            : new URL(href, this.baseUrl).toString();

          // First handle main page selectors (including URL)
          for (const parsed of parsedIds) {
            if (!parsed.pageId) {
              // Handle main page content
              if (parsed.attribute === 'href' && parsed.subSelector === 'a') {
                rowData[parsed.columnName] = articleUrl;
              } else {
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

          // Check if we need page-specific content
          const needsPageContent = parsedIds.some((p) => p.pageId);
          if (needsPageContent) {
            const articleDoc = await this.fetchAndParse(articleUrl);
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

          if (Object.keys(rowData).length > 0) {
            results.push(rowData);
            console.log(`Processed item:`, rowData);
          }
        }
      }

      onProgress(100, `Successfully processed ${results.length} items`);
      return results;
    } catch (error) {
      console.error('Crawling error:', error);
      throw error;
    }
  }
}
