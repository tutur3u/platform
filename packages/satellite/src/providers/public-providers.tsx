'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

/** Theme-only providers for public SSR; no actor, session or account refresh. */
export function PublicSatelliteProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      enableSystem
      scriptProps={{ 'data-cfasync': 'false' }}
    >
      {children}
    </ThemeProvider>
  );
}
