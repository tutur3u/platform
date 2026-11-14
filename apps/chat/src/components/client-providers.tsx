'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { GlobalCommandLauncher } from '@tuturuuu/satellite/command-launcher';
import { ExperimentalUiSync } from '@tuturuuu/ui/custom/experimental-ui-sync';
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
  const [queryClient] = useState(() => createChatQueryClient());

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <ExperimentalUiSync />
      <QueryClientProvider client={queryClient}>
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
