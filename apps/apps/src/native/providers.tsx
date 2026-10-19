import { ClientProviders } from '@tuturuuu/satellite/client-providers';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
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
  return (
    <ThemeProvider
      attribute="class"
      themes={['system', 'light', 'dark']}
      enableSystem
      scriptProps={{ 'data-cfasync': 'false' }}
    >
      <IntlProvider
        locale={data.locale}
        messages={data.locale === 'vi' ? vi : en}
      >
        <ClientProviders actorId={data.actorId ?? undefined} currentApp="apps">
          {children}
          {data.release && <VersionBadge release={data.release} />}
          <TailwindIndicator />
          <Toaster />
        </ClientProviders>
      </IntlProvider>
    </ThemeProvider>
  );
}
