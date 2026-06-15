import {
  getLaunchableAppByTitle,
  type LaunchableAppSlug,
} from '@tuturuuu/utils/launchable-apps';
import { NextIntlClientProvider } from 'next-intl';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, Suspense } from 'react';
import { SatelliteVersionBadge } from '../components/version-badge-gate';
import { ClientProviders } from './client-providers';

export function Providers({
  appName = 'Tuturuuu App',
  children,
  currentApp,
}: {
  appName?: string;
  children: ReactNode;
  currentApp?: LaunchableAppSlug;
}) {
  const launchableApp =
    currentApp ??
    getLaunchableAppByTitle(appName)?.slug ??
    getLaunchableAppByTitle(appName.replace(/^Tuturuuu\s+/i, ''))?.slug;

  return (
    <NextIntlClientProvider>
      {/*
        ThemeProvider stays ABOVE the Suspense boundary on purpose. next-themes
        injects a no-flash <script>; when that script lives inside a Suspense
        subtree React re-renders it on the client, which trips the
        "Encountered a script tag while rendering React component" warning.
        Keeping the provider outside Suspense renders the script on the server
        and leaves it untouched on the client.
      */}
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
        <Suspense fallback={null}>
          <ClientProviders currentApp={launchableApp}>
            {children}
            <Suspense fallback={null}>
              <SatelliteVersionBadge appName={appName} />
            </Suspense>
          </ClientProviders>
        </Suspense>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
