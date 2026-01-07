export interface SerwistNextConfig {
  /**
   * Path to the service worker source file (relative to app root)
   * @default 'src/app/sw.ts'
   */
  swSrc?: string;

  /**
   * Path where the compiled service worker will be output
   * @default 'public/sw.js'
   */
  swDest?: string;

  /**
   * URL of the offline fallback page
   * @default '/~offline'
   */
  offlineFallbackUrl?: string;

  /**
   * Git revision for cache busting (auto-detected if not provided)
   */
  revision?: string;

  /**
   * Whether to disable the service worker in development
   * @default false
   */
  disableInDev?: boolean;
}
