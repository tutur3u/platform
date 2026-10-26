import { ClientProviders } from '@tuturuuu/satellite/client-providers';
import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { VersionBadge } from '@tuturuuu/ui/custom/version-badge';
import { Toaster } from '@tuturuuu/ui/sonner';
import { getPlatformReleaseInfo } from '@tuturuuu/utils/platform-release';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import { type ReactNode, Suspense } from 'react';
import { useLocaleMessages } from './locale-messages';
import { MeetParamsContext } from './next-navigation';
import { MeetThemeProvider as ThemeProvider } from './theme-provider';

function LocaleMessages({
  locale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  const messages = useLocaleMessages(locale);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}

export function AppProviders({
  locale,
  actorId,
  showVersionBadge,
  params,
  children,
}: {
  locale: string;
  actorId?: string;
  showVersionBadge: boolean;
  params: Record<string, string>;
  children: ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      themes={['system', 'light', 'dark']}
      enableSystem
      scriptProps={{ 'data-cfasync': 'false' }}
    >
      <Suspense fallback={null}>
        <LocaleMessages locale={locale}>
          <MeetParamsContext value={params}>
            <NuqsAdapter>
              <ClientProviders
                key={actorId ?? 'anonymous'}
                actorId={actorId}
                currentApp="meet"
              >
                {children}
                {showVersionBadge && (
                  <VersionBadge
                    release={getPlatformReleaseInfo('Tuturuuu Meet')}
                  />
                )}
                <TailwindIndicator />
                <ProductionIndicator />
                <Toaster />
              </ClientProviders>
            </NuqsAdapter>
          </MeetParamsContext>
        </LocaleMessages>
      </Suspense>
    </ThemeProvider>
  );
}
