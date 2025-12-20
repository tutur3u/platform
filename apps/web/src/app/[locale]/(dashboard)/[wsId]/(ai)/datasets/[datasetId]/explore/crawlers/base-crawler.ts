/**
 * Base crawler class for fetching external data.
 *
 * NOTE: The proxy endpoint (/api/proxy) was removed for security reasons (SSRF vulnerability).
 * Crawlers now fetch URLs directly, which may have CORS limitations for some external URLs.
 * For server-side usage, direct fetching should work fine.
 */
export abstract class BaseCrawler {
  constructor(_options?: { useProductionProxy?: boolean }) {
    // Proxy options are deprecated and ignored - kept for backward compatibility
  }

  /**
   * Fetches a URL directly.
   * Note: Previously this used a proxy, but that was removed for security reasons.
   */
  protected async fetchWithProxy(
    url: string,
    init?: RequestInit
  ): Promise<Response> {
    return fetch(url, init);
  }
}
