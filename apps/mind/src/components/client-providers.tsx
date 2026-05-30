'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { GlobalCommandLauncher } from '@tuturuuu/satellite/command-launcher';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, useState } from 'react';
import { createMindQueryClient } from './query-client';

export function ClientProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => createMindQueryClient());

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        {children}
        <GlobalCommandLauncher currentApp="mind" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
