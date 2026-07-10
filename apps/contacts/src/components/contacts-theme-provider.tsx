'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

export function ContactsThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  );
}
