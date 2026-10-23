import { ClientProviders } from '@tuturuuu/satellite/client-providers';
import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { VersionBadge } from '@tuturuuu/ui/custom/version-badge';
import { Toaster } from '@tuturuuu/ui/sonner';
import { getPlatformReleaseInfo } from '@tuturuuu/utils/platform-release';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import type { ReactNode } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { MeetParamsContext } from './next-navigation';
import { MeetThemeProvider as ThemeProvider } from './theme-provider';

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
      <NextIntlClientProvider
        locale={locale}
        messages={locale === 'vi' ? vi : en}
      >
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
      </NextIntlClientProvider>
    </ThemeProvider>
  );
}
