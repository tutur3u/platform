'use client';

import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { SorbetPrePaintScript } from '@tuturuuu/ui/custom/sorbet-pre-paint';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

export function PayThemeProvider({ children }: { children: ReactNode }) {
  const nonce = requestNonce();
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      nonce={nonce}
    >
      <SorbetPrePaintScript nonce={nonce} />
      {children}
    </ThemeProvider>
  );
}
