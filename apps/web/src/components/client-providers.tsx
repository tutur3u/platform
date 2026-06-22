'use client';

import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AccountSwitcherKeyboardShortcut } from '@/components/account-switcher/keyboard-shortcut-handler';
import { AccountSwitcherProvider } from '@/context/account-switcher-context';
import {
  installFetchInterceptor,
  setRateLimitMessage,
  setRateLimitToastLabels,
} from '@/lib/fetch-interceptor';

const RateLimitDetailsDialog = dynamic(
  () =>
    import('./rate-limit-details-dialog').then(
      (module) => module.RateLimitDetailsDialog
    ),
  { ssr: false }
);

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
    setRateLimitToastLabels({
      viewDetails: t('rate_limited_view_details'),
    });
  }, [t]);

  return null;
}

export function ClientProviders({ children }: { children: ReactNode }) {
  const content = (
    <>
      <TooltipProvider>{children}</TooltipProvider>
      <AccountSwitcherKeyboardShortcut />
      <FetchInterceptorI18n />
      <RateLimitDetailsDialog />
    </>
  );

  return <AccountSwitcherProvider>{content}</AccountSwitcherProvider>;
}
