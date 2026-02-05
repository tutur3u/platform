/**
 * @deprecated Use `SerwistRouteConfig` from `@tuturuuu/offline/route` instead.
 * This configuration is for the webpack-based approach which is being replaced
 * by the Turbopack-compatible route handler pattern.
 */
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

/**
 * Configuration for the Turbopack-compatible Serwist setup.
 */
export interface TurbopackSerwistConfig {
  /**
   * Additional packages to mark as external for the server.
   * 'esbuild-wasm' is always included automatically.
   */
  additionalExternalPackages?: string[];
}
