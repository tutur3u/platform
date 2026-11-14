'use client';

import { ExperimentalUiSync } from '@tuturuuu/ui/custom/experimental-ui-sync';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

export function TeachThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ExperimentalUiSync />
      {children}
    </ThemeProvider>
  );
}
