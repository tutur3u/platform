'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { GlobalCommandLauncher } from '@tuturuuu/satellite/command-launcher';
import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { ExperimentalUiSync } from '@tuturuuu/ui/custom/experimental-ui-sync';
import { SorbetPrePaintScript } from '@tuturuuu/ui/custom/sorbet-pre-paint';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, useState } from 'react';
import { createMindQueryClient } from './query-client';

export function ClientProviders({ children }: { children: ReactNode }) {
  const nonce = requestNonce();
  const [queryClient] = useState(() => createMindQueryClient());

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      nonce={nonce}
    >
      <SorbetPrePaintScript nonce={nonce} />
      <QueryClientProvider client={queryClient}>
        <ExperimentalUiSync />
        {children}
        <GlobalCommandLauncher currentApp="mind" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
