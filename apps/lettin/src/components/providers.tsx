'use client';
import { ClientProviders } from '@tuturuuu/satellite/client-providers';
import type { ReactNode } from 'react';
import { NavigationGuard } from './navigation-guard';
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ClientProviders currentApp="lettin">
      <NavigationGuard>{children}</NavigationGuard>
    </ClientProviders>
  );
}
