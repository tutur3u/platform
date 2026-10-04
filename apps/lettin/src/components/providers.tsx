'use client';
import { ClientProviders } from '@tuturuuu/satellite/client-providers';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { NavigationGuard } from './navigation-guard';
export function Providers({ children }: { children: ReactNode }) {
  return (
    <NuqsAdapter>
      <ClientProviders currentApp="lettin">
        <NavigationGuard>{children}</NavigationGuard>
      </ClientProviders>
    </NuqsAdapter>
  );
}
