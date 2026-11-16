'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { MessagesCommandLauncher } from '@tuturuuu/satellite/command-launcher';
import { ExperimentalUiSync } from '@tuturuuu/ui/custom/experimental-ui-sync';
import { SorbetPrePaintScript } from '@tuturuuu/ui/custom/sorbet-pre-paint';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, useState } from 'react';
import { createChatQueryClient } from './query-client';

// The launcher mounts above this app's intl provider; its labels load from
// the same message bundle on first open.
const loadLauncherMessages = (locale: 'en' | 'vi') =>
  locale === 'vi'
    ? import('../../messages/vi.json')
    : import('../../messages/en.json');

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
      <SorbetPrePaintScript />
      <QueryClientProvider client={queryClient}>
        <ExperimentalUiSync account={Boolean(actorId)} />
        {actorId ? (
          <WorkspaceVisibilityProvider actorId={actorId}>
            {children}
            <MessagesCommandLauncher
              currentApp="chat"
              loadMessages={loadLauncherMessages}
            />
          </WorkspaceVisibilityProvider>
        ) : (
          <>
            {children}
            <MessagesCommandLauncher
              currentApp="chat"
              loadMessages={loadLauncherMessages}
            />
          </>
        )}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
