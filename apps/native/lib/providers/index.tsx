import type { ReactNode } from 'react';

import { AuthProvider } from './auth-provider';
import { QueryProvider } from './query-provider';

type AppProvidersProps = {
  children: ReactNode;
};

/**
 * Combined providers wrapper for the app
 *
 * Wraps the app with all necessary providers in the correct order:
 * 1. QueryProvider - TanStack Query for data fetching
 * 2. AuthProvider - Auth state initialization
 *
 * @example
 * ```typescript
 * import { AppProviders } from '@/lib/providers';
 *
 * export default function RootLayout() {
 *   return (
 *     <AppProviders>
 *       <Stack>...</Stack>
 *     </AppProviders>
 *   );
 * }
 * ```
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
}

export { AuthProvider } from './auth-provider';
export { QueryProvider } from './query-provider';
