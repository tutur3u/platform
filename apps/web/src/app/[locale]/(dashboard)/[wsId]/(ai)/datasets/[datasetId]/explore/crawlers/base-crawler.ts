/**
 * Base crawler class for fetching external data.
 *
 * NOTE: The proxy endpoint (/api/proxy) was removed for security reasons (SSRF vulnerability).
 * Crawlers now fetch URLs directly, which may have CORS limitations for some external URLs.
 * For server-side usage, direct fetching should work fine.
 */
export abstract class BaseCrawler {
  /**
   * Abstract method to be implemented by subclasses for crawling logic.
   */
  abstract crawl(props: any): Promise<any>;

  /**
   * Fetches a URL directly.
   * Keeps the name fetchWithProxy for backward compatibility.
   */
  protected async fetchWithProxy(
    url: string,
    options?: RequestInit
  ): Promise<Response> {
    return fetch(url, options);
  }
}