'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { MessagesCommandLauncher } from '@tuturuuu/satellite/command-launcher';
import { ExperimentalUiSync } from '@tuturuuu/ui/custom/experimental-ui-sync';
import { SorbetPrePaintScript } from '@tuturuuu/ui/custom/sorbet-pre-paint';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, useState } from 'react';
import { createMindQueryClient } from './query-client';

// The launcher mounts above this app's intl provider; its labels load from
// the same message bundle on first open.
const loadLauncherMessages = (locale: 'en' | 'vi') =>
  locale === 'vi'
    ? import('../../messages/vi.json')
    : import('../../messages/en.json');

export function ClientProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createMindQueryClient());

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SorbetPrePaintScript />
      <QueryClientProvider client={queryClient}>
        <ExperimentalUiSync />
        {children}
        <MessagesCommandLauncher
          currentApp="mind"
          loadMessages={loadLauncherMessages}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
