import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { InstantThemeSwap } from '@tuturuuu/ui/custom/instant-theme-swap';
import { SorbetPrePaintScript } from '@tuturuuu/ui/custom/sorbet-pre-paint';
import { tuturuuuThemeProviderProps } from '@tuturuuu/ui/custom/theme-provider-preset';
import { Toaster } from '@tuturuuu/ui/sonner';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { ClientProviders } from './client-providers';

export function Providers({ children }: { children: ReactNode }) {
  const nonce = requestNonce();
  return (
    <ThemeProvider
      {...tuturuuuThemeProviderProps}
      nonce={nonce}
      defaultTheme="dark"
    >
      <InstantThemeSwap nonce={nonce} />
      <SorbetPrePaintScript nonce={nonce} />
      <ClientProviders>{children}</ClientProviders>
      <Toaster />
    </ThemeProvider>
  );
}
