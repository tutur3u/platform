import { ClientProviders } from './client-providers';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      themes={['system', 'light', 'dark']}
      enableSystem
    >
      <ClientProviders>{children}</ClientProviders>
    </ThemeProvider>
  );
}
