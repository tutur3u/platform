import { API_URL } from '@/constants/common';

export abstract class BaseCrawler {
  protected useProductionProxy = true;
  protected proxyApiKey = process.env.NEXT_PUBLIC_PROXY_API_KEY || '';

  constructor({ useProductionProxy = true }: { useProductionProxy?: boolean }) {
    this.useProductionProxy = useProductionProxy;
    this.proxyApiKey = process.env.NEXT_PUBLIC_PROXY_API_KEY || '';
  }

  protected getProxyUrl(url: string): string {
    const baseUrl = this.useProductionProxy
      ? 'https://tuturuuu.com/api/proxy'
      : `${API_URL}/proxy`;

    const proxyUrl = new URL(baseUrl);
    proxyUrl.searchParams.set('url', url);
    if (this.proxyApiKey) {
      proxyUrl.searchParams.set('apiKey', this.proxyApiKey);
    }
    return proxyUrl.toString();
  }

  protected async fetchWithProxy(
    url: string,
    init?: RequestInit
  ): Promise<Response> {
    const requestInit: RequestInit = {
      ...init,
      headers: {
        ...init?.headers,
        ...(this.proxyApiKey && { 'x-proxy-api-key': this.proxyApiKey }),
      },
    };
    return fetch(this.getProxyUrl(url), requestInit);
  }
}
