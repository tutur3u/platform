import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { SorbetPrePaintScript } from '@tuturuuu/ui/custom/sorbet-pre-paint';
import { Toaster } from '@tuturuuu/ui/sonner';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { ClientProviders } from './client-providers';

export function Providers({ children }: { children: ReactNode }) {
  const nonce = requestNonce();
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      themes={['system', 'light', 'dark']}
      enableSystem
      nonce={nonce}
    >
      <SorbetPrePaintScript nonce={nonce} />
      <ClientProviders>{children}</ClientProviders>
      <Toaster />
    </ThemeProvider>
  );
}
