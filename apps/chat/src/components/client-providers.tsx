'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { GlobalCommandLauncher } from '@tuturuuu/satellite/command-launcher';
import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { ExperimentalUiSync } from '@tuturuuu/ui/custom/experimental-ui-sync';
import { InstantThemeSwap } from '@tuturuuu/ui/custom/instant-theme-swap';
import { SorbetPrePaintScript } from '@tuturuuu/ui/custom/sorbet-pre-paint';
import { tuturuuuThemeProviderProps } from '@tuturuuu/ui/custom/theme-provider-preset';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, useState } from 'react';
import { createChatQueryClient } from './query-client';

export function ClientProviders({
  children,
  actorId,
}: {
  children: ReactNode;
  actorId?: string;
}) {
  const nonce = requestNonce();
  const [queryClient] = useState(() => createChatQueryClient());

  return (
    <ThemeProvider {...tuturuuuThemeProviderProps} nonce={nonce}>
      <InstantThemeSwap nonce={nonce} />
      <SorbetPrePaintScript nonce={nonce} />
      <QueryClientProvider client={queryClient}>
        <ExperimentalUiSync account={Boolean(actorId)} />
        {actorId ? (
          <WorkspaceVisibilityProvider actorId={actorId}>
            {children}
            <GlobalCommandLauncher currentApp="chat" />
          </WorkspaceVisibilityProvider>
        ) : (
          <>
            {children}
            <GlobalCommandLauncher currentApp="chat" />
          </>
        )}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
