'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GlobalCommandLauncher } from '@tuturuuu/satellite/command-launcher';
import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, useState } from 'react';

export function ClientProviders({
  children,
  actorId,
}: {
  children: ReactNode;
  actorId?: string;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
          },
        },
      })
  );

  return (
    // next-themes renders an inline script that sets the theme class before
    // paint. The enforced CSP (`script-src 'nonce-…' 'strict-dynamic'`) blocks
    // it without this request's nonce. `requestNonce()` is only defined during
    // SSR (the browser has no request store), and next-themes itself emits an
    // empty nonce on the client, so hydration matches the nonce-hiding DOM. The
    // nonce is read here, not passed from the server `Providers`, so it is
    // never part of the serialized RSC payload.
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      nonce={requestNonce()}
    >
      <QueryClientProvider client={queryClient}>
        {actorId ? (
          <WorkspaceVisibilityProvider actorId={actorId}>
            {children}
            <GlobalCommandLauncher currentApp="learn" />
          </WorkspaceVisibilityProvider>
        ) : (
          <>
            {children}
            <GlobalCommandLauncher currentApp="learn" />
          </>
        )}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
