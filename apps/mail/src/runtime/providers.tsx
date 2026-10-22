import { OfflineProvider } from '@tuturuuu/offline/provider';
import { ClientProviders } from '@tuturuuu/satellite/client-providers';
import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { VersionBadge } from '@tuturuuu/ui/custom/version-badge';
import { Toaster } from '@tuturuuu/ui/sonner';
import { getPlatformReleaseInfo } from '@tuturuuu/utils/platform-release';
import { VercelAnalytics, VercelInsights } from '@tuturuuu/vercel';
import { NextIntlClientProvider } from 'next-intl';
import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import type { ReactNode } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { MailParamsContext } from './next-navigation';

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
      <OfflineProvider register={false}>
        <VercelAnalytics />
        <VercelInsights />
        <NextIntlClientProvider
          locale={locale}
          messages={locale === 'vi' ? vi : en}
        >
          <MailParamsContext value={params}>
            <NuqsAdapter>
              <ClientProviders
                key={actorId ?? 'anonymous'}
                actorId={actorId}
                currentApp="mail"
              >
                {children}
                {showVersionBadge && (
                  <VersionBadge
                    release={getPlatformReleaseInfo('Tuturuuu Mail')}
                  />
                )}
                <TailwindIndicator />
                <ProductionIndicator />
                <Toaster />
              </ClientProviders>
            </NuqsAdapter>
          </MailParamsContext>
        </NextIntlClientProvider>
      </OfflineProvider>
    </ThemeProvider>
  );
}
