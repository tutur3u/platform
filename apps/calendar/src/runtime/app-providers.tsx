import { ClientProviders } from '@tuturuuu/satellite/client-providers';
import { FadeSettingInitializer } from '@tuturuuu/tasks-ui/tu-do/shared/fade-setting-initializer';
import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { StaffToolbar } from '@tuturuuu/ui/custom/staff-toolbar';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { VersionBadge } from '@tuturuuu/ui/custom/version-badge';
import { PwaStatus } from '@tuturuuu/ui/pwa-status';
import { Toaster } from '@tuturuuu/ui/sonner';
import { getPlatformReleaseInfo } from '@tuturuuu/utils/platform-release';
import { NextIntlClientProvider, useTranslations } from 'next-intl';
import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import type { ReactNode } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { CalendarParamsContext } from './next-navigation';
import { CalendarOfflineProvider } from './offline-registration';

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
        <CalendarParamsContext value={params}>
          <NuqsAdapter>
            <ClientProviders
              key={actorId ?? 'anonymous'}
              actorId={actorId}
              currentApp="calendar"
            >
              <CalendarOfflineProvider>
                <FadeSettingInitializer />
                {children}
                <OfflineStatus />
              </CalendarOfflineProvider>
              <StaffToolbar />
              {showVersionBadge && (
                <VersionBadge
                  release={getPlatformReleaseInfo('Tuturuuu Calendar')}
                />
              )}
              <TailwindIndicator />
              <ProductionIndicator />
              <Toaster />
            </ClientProviders>
          </NuqsAdapter>
        </CalendarParamsContext>
      </NextIntlClientProvider>
    </ThemeProvider>
  );
}

function OfflineStatus() {
  const t = useTranslations('pwa');
  return (
    <PwaStatus
      labels={{
        offline_status: t('offline_status'),
        install: t('install'),
        install_help: t('install_help'),
        cache_help: t('cache_help'),
      }}
    />
  );
}
