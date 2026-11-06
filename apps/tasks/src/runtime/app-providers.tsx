import { ClientProviders } from '@tuturuuu/satellite/client-providers';
import { BridgeParamsContext } from '@tuturuuu/start-bridge/next/navigation';
import { FadeSettingInitializer } from '@tuturuuu/tasks-ui/tu-do/shared/fade-setting-initializer';
import { TaskSoundEffectsInitializer } from '@tuturuuu/tasks-ui/tu-do/shared/task-sound-effects';
import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { StaffToolbar } from '@tuturuuu/ui/custom/staff-toolbar';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { Toaster } from '@tuturuuu/ui/sonner';
import { NextIntlClientProvider } from 'next-intl';
import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import type { ReactNode } from 'react';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

/**
 * The native counterpart of the `[locale]` root layout providers. The
 * offline service worker and Vercel analytics stay on the Next build until
 * the native offline port lands.
 */
export function AppProviders({
  locale,
  actorId,
  params,
  children,
}: {
  locale: string;
  actorId?: string;
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
        <BridgeParamsContext value={params}>
          <NuqsAdapter>
            <ClientProviders
              key={actorId ?? 'anonymous'}
              actorId={actorId}
              currentApp="tasks"
            >
              <FadeSettingInitializer />
              <TaskSoundEffectsInitializer />
              {children}
              <StaffToolbar />
              <TailwindIndicator />
              <ProductionIndicator />
              <Toaster />
            </ClientProviders>
          </NuqsAdapter>
        </BridgeParamsContext>
      </NextIntlClientProvider>
    </ThemeProvider>
  );
}
