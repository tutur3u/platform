import { ClientProviders } from '@tuturuuu/satellite/client-providers';
import { requestNonce } from '@tuturuuu/start-bridge/csp';
import { InstantThemeSwap } from '@tuturuuu/ui/custom/instant-theme-swap';
import { SorbetPrePaintScript } from '@tuturuuu/ui/custom/sorbet-pre-paint';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { tuturuuuThemeProviderProps } from '@tuturuuu/ui/custom/theme-provider-preset';
import { VersionBadge } from '@tuturuuu/ui/custom/version-badge';
import { Toaster } from '@tuturuuu/ui/sonner';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { IntlProvider } from 'use-intl';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import type { loadGateway } from './page-data';

type Data = Awaited<ReturnType<typeof loadGateway>>;
export function GatewayProviders({
  data,
  children,
}: {
  data: Data;
  children: ReactNode;
}) {
  const nonce = requestNonce();
  return (
    <ThemeProvider {...tuturuuuThemeProviderProps} nonce={nonce}>
      <InstantThemeSwap nonce={nonce} />
      <SorbetPrePaintScript nonce={nonce} />
      <IntlProvider
        locale={data.locale}
        messages={data.locale === 'vi' ? vi : en}
      >
        <ClientProviders
          actorId={data.actorId ?? undefined}
          accountSync={Boolean(data.actorId)}
          currentApp="apps"
        >
          {children}
          {data.release && <VersionBadge release={data.release} />}
          <TailwindIndicator />
          <Toaster />
        </ClientProviders>
      </IntlProvider>
    </ThemeProvider>
  );
}
