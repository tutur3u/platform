import { NextIntlClientProvider } from 'next-intl';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { ClientProviders } from './client-providers';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider>
      <ThemeProvider
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
        <ClientProviders>{children}</ClientProviders>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
