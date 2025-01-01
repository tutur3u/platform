'use client';

interface HtmlCrawlerProps {
  url: string;
  htmlIds: string[];
  // eslint-disable-next-line no-unused-vars
  onProgress: (progress: number, status: string) => void;
}

interface ParsedHtmlId {
  columnName: string;
  selector: string;
  isMultiple: boolean;
  subSelector?: string;
  pageId?: string; // For element IDs on article pages
  attribute?: string;
}

export class HtmlCrawler {
  private baseUrl: string = '';

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
      [finalSubSelector, pageId] = subSelector.split('->#');
      pageId = pageId.trim();
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
      const response = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
      const html = await response.text();
      const parser = new DOMParser();
      return parser.parseFromString(html, 'text/html');
    } catch (e) {
      console.error('Error fetching page:', url, e);
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

  async crawl({ url, htmlIds, onProgress }: HtmlCrawlerProps): Promise<any[]> {
    this.baseUrl = url;
    const results: any[] = [];
    const parsedIds = htmlIds.map((id) => this.parseHtmlId(id));

    try {
      onProgress(10, 'Fetching main page...');
      const mainDoc = await this.fetchAndParse(url);
      if (!mainDoc) throw new Error('Failed to fetch main page');

      // Get all news links first
      const newsContainer = mainDoc.querySelector('.news');
      if (!newsContainer) throw new Error('News container not found');

      const newsItems = Array.from(newsContainer.querySelectorAll('a.item'));
      console.log(`Found ${newsItems.length} news items`);

      // Process each news item
      for (let i = 0; i < newsItems.length; i++) {
        const item = newsItems[i];
        const rowData: Record<string, string> = {};

        // Get the article URL
        const href = item.getAttribute('href');
        if (!href) continue;

        const articleUrl = href.startsWith('..')
          ? new URL(href.replace('..', ''), this.baseUrl).toString()
          : new URL(href, this.baseUrl).toString();

        // Store URL if requested
        const urlColumn = parsedIds.find((p) => p.columnName === 'URL');
        if (urlColumn) {
          rowData.URL = articleUrl;
        }

        // Fetch and parse article page if we have any page IDs to process
        if (parsedIds.some((p) => p.pageId)) {
          const articleDoc = await this.fetchAndParse(articleUrl);
          if (!articleDoc) continue;

          // Extract content using IDs
          for (const parsed of parsedIds) {
            if (parsed.columnName === 'URL') continue;

            if (parsed.pageId) {
              // Use getElementById for page content
              const element = articleDoc.getElementById(parsed.pageId);
              if (element) {
                rowData[parsed.columnName] = element.textContent?.trim() || '';
              }
            }
          }
        }

        if (Object.keys(rowData).length > 0) {
          results.push(rowData);
          console.log(`Processed article: ${articleUrl}`, rowData);
        }

        onProgress(
          10 + Math.round(((i + 1) / newsItems.length) * 90),
          `Processing article ${i + 1} of ${newsItems.length}`
        );
      }

      onProgress(100, `Successfully crawled ${results.length} articles`);
      return results;
    } catch (error) {
      console.error('Crawling error:', error);
      throw error;
    }
  }
}
