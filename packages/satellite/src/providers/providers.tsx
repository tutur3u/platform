import {
  getLaunchableAppByTitle,
  type LaunchableAppSlug,
} from '@tuturuuu/utils/launchable-apps';
import { connection } from 'next/server';
import { NextIntlClientProvider } from 'next-intl';
import { ThemeProvider } from 'next-themes';
import { type ReactNode, Suspense } from 'react';
import { getSatelliteAppSessionUser } from '../auth';
import { SatelliteVersionBadge } from '../components/version-badge-gate';
import { ClientProviders } from './client-providers';

export function Providers({
  appName = 'Tuturuuu App',
  children,
  currentApp,
  loadingFallback = null,
}: {
  appName?: string;
  children: ReactNode;
  currentApp?: LaunchableAppSlug;
  loadingFallback?: ReactNode;
}) {
  const launchableApp =
    currentApp ??
    getLaunchableAppByTitle(appName)?.slug ??
    getLaunchableAppByTitle(appName.replace(/^Tuturuuu\s+/i, ''))?.slug;

  return (
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
      {/*
        ThemeProvider stays ABOVE the Suspense boundary on purpose. next-themes
        injects a no-flash <script>; when that script lives inside a Suspense
        subtree React re-renders it on the client. NextIntlClientProvider stays
        inside because resolving its request config can access runtime data.
      */}
      <Suspense fallback={loadingFallback}>
        <NextIntlClientProvider>
          <VerifiedClientProviders currentApp={launchableApp}>
            {children}
            <Suspense fallback={null}>
              <SatelliteVersionBadge appName={appName} />
            </Suspense>
          </VerifiedClientProviders>
        </NextIntlClientProvider>
      </Suspense>
    </ThemeProvider>
  );
}

async function VerifiedClientProviders({
  children,
  currentApp,
}: {
  children: ReactNode;
  currentApp?: LaunchableAppSlug;
}) {
  // Session verification reads the current clock even when cookies/headers
  // were resolved by an ancestor. Suspense permits suspension but does not
  // itself exclude that clock read from Cache Components prerendering.
  await connection();
  const user = currentApp ? await getSatelliteAppSessionUser(currentApp) : null;
  return (
    <ClientProviders actorId={user?.id} currentApp={currentApp}>
      {children}
    </ClientProviders>
  );
}
