import type { NextConfig } from 'next';

/**
 * Compatibility options for the retired webpack integration.
 */
export interface OfflineNextConfig {
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
 * Configuration for the internally owned Turbopack worker setup.
 */
export interface TurbopackOfflineConfig {
  /**
   * Absolute path to the Next.js project root used as the base for output file
   * tracing includes.
   * @default process.cwd()
   */
  projectRoot?: string;

  /**
   * Additional packages to mark as external for the server.
   * 'esbuild-wasm' is always included automatically.
   */
  additionalExternalPackages?: string[];

  /**
   * Additional Next.js output file tracing includes to merge with the worker
   * route defaults.
   */
  outputFileTracingIncludes?: NonNullable<
    NextConfig['outputFileTracingIncludes']
  >;
}

/** @deprecated Use `OfflineNextConfig`. */
export type SerwistNextConfig = OfflineNextConfig;

/** @deprecated Use `TurbopackOfflineConfig`. */
export type TurbopackSerwistConfig = TurbopackOfflineConfig;
