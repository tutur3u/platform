'use client';

import { type ReactNode, useEffect } from 'react';

const registrationPromises = new Map<
  string,
  Promise<ServiceWorkerRegistration>
>();

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

  useEffect(() => {
    if (
      shouldSkip ||
      !register ||
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
