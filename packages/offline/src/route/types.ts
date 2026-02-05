import type { NextResponse } from 'next/server';

export interface SerwistRouteConfig {
  /**
   * Path to the service worker source file (relative to app root)
   * @default 'src/app/sw.ts'
   */
  swSrc?: string;

  /**
   * URL of the offline fallback page to precache
   * @default '/~offline'
   */
  offlineFallbackUrl?: string;

  /**
   * Git revision for cache busting (auto-detected if not provided)
   */
  revision?: string;

  /**
   * Whether to skip service worker registration in development
   * @default true
   */
  disableInDev?: boolean;

  /**
   * The directory to search for files to precache.
   * @default '.'
   */
  globDirectory?: string;

  /**
   * Next.js configuration options that Serwist needs.
   */
  nextConfig?: {
    /**
     * The Next.js `assetPrefix` config option.
     */
    assetPrefix?: string;
    /**
     * The Next.js `basePath` config option.
     * @default '/'
     */
    basePath?: string;
    /**
     * The Next.js `distDir` config option.
     * @default '.next'
     */
    distDir?: string;
  };
}

export interface SerwistRouteResult {
  /**
   * Route segment config: force static generation
   */
  dynamic: 'force-static';

  /**
   * Route segment config: no dynamic params
   */
  dynamicParams: false;

  /**
   * Route segment config: no revalidation
   */
  revalidate: false;

  /**
   * Generates static params for the route
   */
  generateStaticParams: () => Promise<{ path: string }[]>;

  /**
   * Handler for GET requests to serve the service worker
   */
  GET: (
    request: Request,
    context: { params: Promise<{ path: string }> }
  ) => Promise<NextResponse<unknown>>;
}
