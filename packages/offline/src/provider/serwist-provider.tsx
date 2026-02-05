'use client';

import { SerwistProvider as TurbopackSerwistProvider } from '@serwist/turbopack/react';
import type { ReactNode } from 'react';

export interface SerwistProviderProps {
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
 * Client-side provider for Serwist service worker registration.
 *
 * Wrap your app with this provider to enable service worker registration.
 * By default, registration is skipped in development mode.
 *
 * @example
 * ```tsx
 * // In your layout.tsx:
 * import { SerwistProvider } from '@tuturuuu/offline/provider';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <SerwistProvider>
 *           {children}
 *         </SerwistProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function SerwistProvider({
  children,
  skipInDev = true,
  swUrl = '/serwist/sw.js',
  register = true,
  reloadOnOnline = false,
  options,
}: SerwistProviderProps) {
  // Skip registration in development if configured
  const shouldSkip = skipInDev && process.env.NODE_ENV === 'development';

  if (shouldSkip) {
    return <>{children}</>;
  }

  return (
    <TurbopackSerwistProvider
      swUrl={swUrl}
      register={register}
      reloadOnOnline={reloadOnOnline}
      options={options}
    >
      {children}
    </TurbopackSerwistProvider>
  );
}
