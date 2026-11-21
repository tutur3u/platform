import { OfflineProvider } from '@tuturuuu/offline/provider';
import { APP_BASE_HEADER } from '@tuturuuu/start-bridge/mounts';
import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { StaffToolbar } from '@tuturuuu/ui/custom/staff-toolbar';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { Providers } from '@/components/providers';
import { siteConfig } from '@/constants/configs';
import { supportedLocales } from '@/i18n/routing';
import { FINANCE_APEX_URL } from '@/start-bridge/finance-mounts.mjs';
import '@tuturuuu/ui/globals.css';
import { Toaster } from '@tuturuuu/ui/sonner';
import { font, generateCommonMetadata } from '@tuturuuu/utils/common/nextjs';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { resolveRootLocale } from '@tuturuuu/utils/i18n-root-locale';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { locale as getRootLocale } from 'next/root-params';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { Suspense } from 'react';

export { viewport } from '@tuturuuu/utils/common/nextjs';

interface Props {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const mounted = (await headers()).get(APP_BASE_HEADER) === '/finance';
  return generateCommonMetadata({
    config: {
      description: {
        en: 'Track expenses, manage budgets, and gain financial insights powered by AI.',
        vi: 'Theo dõi chi tiêu, quản lý ngân sách và phân tích tài chính với AI.',
      },
      indexable: false,
      keywords: [
        'expense tracking',
        'budget management',
        'financial analytics',
        'workspace finance',
      ],
      name: siteConfig.name,
      url: mounted ? FINANCE_APEX_URL : siteConfig.url,
      ogImage: mounted
        ? `${FINANCE_APEX_URL}/media/logos/og-image.png`
        : siteConfig.ogImage,
    },
    params,
  });
}

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({
    locale,
    wsId: ROOT_WORKSPACE_ID,
  }));
}

export default async function RootLayout({ children }: Props) {
  const locale = await resolveRootLocale(
    supportedLocales,
    await getRootLocale()
  );

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={cn(
          'overflow-y-auto bg-root-background antialiased',
          font.className
        )}
      >
        <OfflineProvider register={false}>
          <NuqsAdapter>
            <Suspense>
              <Providers appName={siteConfig.name}>{children}</Providers>
            </Suspense>
          </NuqsAdapter>
          <TailwindIndicator />
          <ProductionIndicator />
          <StaffToolbar />
          <Toaster />
        </OfflineProvider>
      </body>
    </html>
  );
}
