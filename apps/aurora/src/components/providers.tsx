import { ClientProviders } from './client-providers';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      themes={[
        'system',

        'light',
        'light-pink',
        'light-purple',
        'light-yellow',
        'light-orange',
        'light-green',
        'light-blue',

        'dark',
        'dark-pink',
        'dark-purple',
        'dark-yellow',
        'dark-orange',
        'dark-green',
        'dark-blue',
      ]}
      enableColorScheme={false}
      enableSystem
    >
      <ClientProviders>{children}</ClientProviders>
    </ThemeProvider>
  );
}
