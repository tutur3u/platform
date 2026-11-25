'use client';

import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { InstantThemeSwap } from '@tuturuuu/ui/custom/instant-theme-swap';
import { SorbetPrePaintScript } from '@tuturuuu/ui/custom/sorbet-pre-paint';
import { tuturuuuThemeProviderProps } from '@tuturuuu/ui/custom/theme-provider-preset';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

export function ContactsThemeProvider({ children }: { children: ReactNode }) {
  const nonce = requestNonce();
  return (
    <ThemeProvider {...tuturuuuThemeProviderProps} nonce={nonce}>
      <InstantThemeSwap nonce={nonce} />
      <SorbetPrePaintScript nonce={nonce} />
      {children}
    </ThemeProvider>
  );
}
