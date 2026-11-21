'use client';

import { type ReactNode, useEffect } from 'react';
import { installChunkReloadGuard } from './chunk-reload-guard';

const registrationPromises = new Map<
  string,
  Promise<ServiceWorkerRegistration>
>();

/**
 * Global the Tuturuuu Start bridge writes into the document head with the
 * app's runtime base (`/tasks` on `tuturuuu.com/tasks`, empty at a subdomain
 * root). Read here without importing the bridge so the package stays
 * framework-free.
 */
const APP_BASE_GLOBAL = '__tuturuuuAppBase';

/**
 * Whether this document is an app mounted under a path of a shared origin.
 * Its `/`-scoped worker would control every other app on that origin, so a
 * mounted document never registers one.
 */
export function isMountedDocument(scope: typeof globalThis = globalThis) {
  const value = (scope as { [APP_BASE_GLOBAL]?: unknown })[APP_BASE_GLOBAL];
  const base = typeof value === 'function' ? value() : value;
  return typeof base === 'string' && base !== '' && base !== '/';
}

function registerWorker(
  swUrl: string,
  options?: RegistrationOptions
): Promise<ServiceWorkerRegistration> {
  const key = `${swUrl}:${JSON.stringify(options ?? {})}`;
  const existing = registrationPromises.get(key);

  if (existing) {
    return existing;
  }

  const registration = navigator.serviceWorker.register(swUrl, options);
  registrationPromises.set(key, registration);
  registration.catch(() => registrationPromises.delete(key));
  return registration;
}

export interface OfflineProviderProps {
  /**
   * Child components to wrap with the provider
   */
  children: ReactNode;

  /**
   * Whether to skip service worker registration in development
   * @default true
   */
  skipInDev?: boolean;

  /**
   * URL path to the service worker
   * @default '/serwist/sw.js'
   */
  swUrl?: string;

  /**
   * Whether to register the service worker.
   * @default true
   */
  register?: boolean;

  /**
   * Whether to reload the page when the browser goes back online.
   * @default false
   */
  reloadOnOnline?: boolean;

  /**
   * Service worker registration options.
   */
  options?: RegistrationOptions;
}

/**
 * Client-side provider for the Tuturuuu-owned service worker registration.
 *
 * Wrap your app with this provider to enable service worker registration.
 * By default, registration is skipped in development mode.
 *
 * @example
 * ```tsx
 * // In your layout.tsx:
 * import { OfflineProvider } from '@tuturuuu/offline/provider';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <OfflineProvider>
 *           {children}
 *         </OfflineProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function OfflineProvider({
  children,
  skipInDev = true,
  swUrl = '/serwist/sw.js',
  register = true,
  reloadOnOnline = false,
  options,
}: OfflineProviderProps) {
  // Skip registration in development if configured
  const shouldSkip = skipInDev && process.env.NODE_ENV === 'development';

  // A deploy that replaces this page's chunks recovers with one reload
  // instead of the error boundary, whether or not a worker is registered.
  useEffect(() => {
    if (shouldSkip || typeof window === 'undefined') return;
    return installChunkReloadGuard({ window });
  }, [shouldSkip]);

  useEffect(() => {
    if (
      shouldSkip ||
      !register ||
      isMountedDocument() ||
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }

    void registerWorker(swUrl, options).catch((error: unknown) => {
      console.error('[offline] Failed to register the service worker.', error);
    });

    if (!reloadOnOnline) {
      return;
    }

    const reload = () => window.location.reload();
    window.addEventListener('online', reload);
    return () => window.removeEventListener('online', reload);
  }, [options, register, reloadOnOnline, shouldSkip, swUrl]);

  return <>{children}</>;
}

/** @deprecated Use `OfflineProvider`. */
export const SerwistProvider = OfflineProvider;
/** @deprecated Use `OfflineProviderProps`. */
export type SerwistProviderProps = OfflineProviderProps;
