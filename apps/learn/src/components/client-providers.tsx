'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GlobalCommandLauncher } from '@tuturuuu/satellite/command-launcher';
import { ExperimentalUiSync } from '@tuturuuu/ui/custom/experimental-ui-sync';
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
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ExperimentalUiSync />
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
