'use client';

import { ExperimentalUiSync } from '@tuturuuu/ui/custom/experimental-ui-sync';
import { InstantThemeSwap } from '@tuturuuu/ui/custom/instant-theme-swap';
import { SorbetPrePaintScript } from '@tuturuuu/ui/custom/sorbet-pre-paint';
import { tuturuuuThemeProviderProps } from '@tuturuuu/ui/custom/theme-provider-preset';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

/** Theme-only providers for public SSR; no actor, session or account refresh. */
export function PublicSatelliteProviders({
  children,
  nonce,
}: {
  children: ReactNode;
  /** The response's CSP nonce, for the theme and Sorbet pre-paint scripts. */
  nonce?: string;
}) {
  return (
    <ThemeProvider {...tuturuuuThemeProviderProps} nonce={nonce}>
      <InstantThemeSwap nonce={nonce} />
      <SorbetPrePaintScript nonce={nonce} />
      <ExperimentalUiSync account={false} />
      {children}
    </ThemeProvider>
  );
}
