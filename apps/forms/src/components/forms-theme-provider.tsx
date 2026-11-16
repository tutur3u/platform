'use client';

import { SorbetPrePaintScript } from '@tuturuuu/ui/custom/sorbet-pre-paint';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

export function FormsThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SorbetPrePaintScript />
      {children}
    </ThemeProvider>
  );
}
