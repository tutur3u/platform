import type { BuildOptions } from 'esbuild-wasm';

type ServiceWorkerEsbuildOptions = Pick<
  BuildOptions,
  'define' | 'supported' | 'target'
>;

export interface OfflineRouteConfig {
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
   * Next.js configuration options used to generate public asset URLs.
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

  /**
   * Options forwarded to the internal esbuild worker bundle.
   */
  esbuildOptions?: ServiceWorkerEsbuildOptions;

  /**
   * Public-file glob patterns to include in the precache manifest.
   * Set to false to avoid precaching public assets.
   * @default all files under public
   */
  publicPrecachePatterns?: readonly string[] | false;
}

export interface OfflineRouteResult {
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
  ) => Promise<Response>;
}

/** @deprecated Use `OfflineRouteConfig`. */
export type SerwistRouteConfig = OfflineRouteConfig;

/** @deprecated Use `OfflineRouteResult`. */
export type SerwistRouteResult = OfflineRouteResult;
