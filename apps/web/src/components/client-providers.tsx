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
} from '@/lib/fetch-interceptor';

const ReactQueryDevtools = dynamic(
  () =>
    import('@tanstack/react-query-devtools').then(
      (module) => module.ReactQueryDevtools
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
  }, [t]);

  return null;
}

export function ClientProviders({ children }: { children: ReactNode }) {
  const content = (
    <>
      <TooltipProvider>{children}</TooltipProvider>
      <AccountSwitcherKeyboardShortcut />
      <FetchInterceptorI18n />
      {process.env.NODE_ENV === 'development' ? (
        <ReactQueryDevtools
          initialIsOpen={false}
          buttonPosition="bottom-right"
        />
      ) : null}
    </>
  );

  return <AccountSwitcherProvider>{content}</AccountSwitcherProvider>;
}
