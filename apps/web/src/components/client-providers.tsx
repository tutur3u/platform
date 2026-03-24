'use client';

import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { FadeSettingInitializer } from '@tuturuuu/ui/tu-do/shared/fade-setting-initializer';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AccountSwitcherKeyboardShortcut } from '@/components/account-switcher';
import { AccountSwitcherProvider } from '@/context/account-switcher-context';
import { CalendarPreferencesProvider } from '@/lib/calendar-preferences-provider';
import {
  installFetchInterceptor,
  setRateLimitMessage,
} from '@/lib/fetch-interceptor';

// Install once when this module loads on the client.
// All fetch() calls — including TanStack Query, tRPC, and raw fetch —
// will transparently retry on 429 with a user-facing toast.
installFetchInterceptor();

/** Bridges next-intl translations into the module-scoped fetch interceptor. */
function FetchInterceptorI18n() {
  const t = useTranslations('common');

  useEffect(() => {
    setRateLimitMessage((seconds) =>
      t('rate_limited_retry', { seconds: String(seconds) })
    );
  }, [t]);

  return null;
}

export function ClientProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSharedSurface = /^\/[^/]+\/shared(?:\/|$)/.test(pathname ?? '');
  const content = (
    <>
      <TooltipProvider>{children}</TooltipProvider>
      {!isSharedSurface ? <FadeSettingInitializer /> : null}
      {!isSharedSurface ? <AccountSwitcherKeyboardShortcut /> : null}
      <FetchInterceptorI18n />
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
    </>
  );

  if (isSharedSurface) {
    return content;
  }

  return (
    <CalendarPreferencesProvider>
      <AccountSwitcherProvider>{content}</AccountSwitcherProvider>
    </CalendarPreferencesProvider>
  );
}
