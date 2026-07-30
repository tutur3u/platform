import '@/lib/dayjs-setup';
import { NextIntlClientProvider } from 'next-intl';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { ClientProviders } from './client-providers';
import { QueryProvider } from './query-provider';

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      themes={['system', 'light', 'dark']}
      enableSystem
      // Rocket Loader is a Cloudflare optimization that defers the loading
      // of inline and external scripts to prioritize the website content.
      // Since next-themes relies on a script injection to avoid screen
      // flashing on page load, Rocket Loader breaks this functionality.
      // Individual scripts can be ignored by adding the data-cfasync="false"
      // attribute to the script tag:
      scriptProps={{ 'data-cfasync': 'false' }}
      // see https://github.com/pacocoursey/next-themes?tab=readme-ov-file#using-with-cloudflare-rocket-loader
      // for more details
    >
      {children}
    </NextThemesProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <NextIntlClientProvider>
        <ClientProviders>{children}</ClientProviders>
      </NextIntlClientProvider>
    </QueryProvider>
  );
}
