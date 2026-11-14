import { ExperimentalUiSync } from '@tuturuuu/ui/custom/experimental-ui-sync';
import { Toaster } from '@tuturuuu/ui/sonner';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { ClientProviders } from './client-providers';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      themes={['system', 'light', 'dark']}
      enableSystem
    >
      <ExperimentalUiSync />
      <ClientProviders>{children}</ClientProviders>
      <Toaster />
    </ThemeProvider>
  );
}
