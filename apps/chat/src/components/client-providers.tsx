'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { GlobalCommandLauncher } from '@tuturuuu/satellite/command-launcher';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, useState } from 'react';
import { createChatQueryClient } from './query-client';

export function ClientProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createChatQueryClient());

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        {children}
        <GlobalCommandLauncher currentApp="chat" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
