'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

export function PayThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  );
}
