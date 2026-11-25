import { InstantThemeSwap } from '@tuturuuu/ui/custom/instant-theme-swap';
import { SorbetPrePaintScript } from '@tuturuuu/ui/custom/sorbet-pre-paint';
import { tuturuuuThemeProviderProps } from '@tuturuuu/ui/custom/theme-provider-preset';
import {
  getLaunchableAppByTitle,
  type LaunchableAppSlug,
} from '@tuturuuu/utils/launchable-apps';
import { connection } from 'next/server';
import { NextIntlClientProvider } from 'next-intl';
import { ThemeProvider as DefaultThemeProvider } from 'next-themes';
import { type ReactNode, Suspense } from 'react';
import { getSatelliteAppSessionUser } from '../auth';
import { SatelliteVersionBadge } from '../components/version-badge-gate';
import { ClientProviders } from './client-providers';

export function Providers({
  appName = 'Tuturuuu App',
  children,
  currentApp,
  loadingFallback = null,
  nonce,
  themeProvider: ThemeProvider = DefaultThemeProvider,
}: {
  appName?: string;
  children: ReactNode;
  currentApp?: LaunchableAppSlug;
  loadingFallback?: ReactNode;
  /**
   * The response's CSP script nonce. Apps served under a strict script policy
   * (the Start bridge) pass it so the theme and Sorbet pre-paint scripts run
   * before hydration instead of being blocked.
   */
  nonce?: string;
  themeProvider?: typeof DefaultThemeProvider;
}) {
  const launchableApp =
    currentApp ??
    getLaunchableAppByTitle(appName)?.slug ??
    getLaunchableAppByTitle(appName.replace(/^Tuturuuu\s+/i, ''))?.slug;

  return (
    <ThemeProvider {...tuturuuuThemeProviderProps} nonce={nonce}>
      <InstantThemeSwap nonce={nonce} />
      <SorbetPrePaintScript nonce={nonce} />
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
