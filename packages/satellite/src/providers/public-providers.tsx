'use client';

import { ExperimentalUiSync } from '@tuturuuu/ui/custom/experimental-ui-sync';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

/** Theme-only providers for public SSR; no actor, session or account refresh. */
export function PublicSatelliteProviders({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      enableSystem
      scriptProps={{ 'data-cfasync': 'false' }}
    >
      <ExperimentalUiSync />
      {children}
    </ThemeProvider>
  );
}
