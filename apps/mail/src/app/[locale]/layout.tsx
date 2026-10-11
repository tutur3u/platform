import { OfflineProvider } from '@tuturuuu/offline/provider';
import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { StaffToolbar } from '@tuturuuu/ui/custom/staff-toolbar';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { Toaster } from '@tuturuuu/ui/sonner';
import { font, generateCommonMetadata } from '@tuturuuu/utils/common/nextjs';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { resolveRootLocale } from '@tuturuuu/utils/i18n-root-locale';
import { VercelAnalytics, VercelInsights } from '@tuturuuu/vercel';
import type { Metadata } from 'next';
import { locale as getRootLocale } from 'next/root-params';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { Providers } from '@/components/providers';
import { siteConfig } from '@/constants/configs';
import { supportedLocales } from '@/i18n/routing';
import '@tuturuuu/ui/globals.css';

export { viewport } from '@tuturuuu/utils/common/nextjs';

interface Props {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return generateCommonMetadata({
    config: {
      description: {
        en: 'Read and send Gmail, Outlook, and managed Tuturuuu mailboxes.',
        vi: 'Đọc và gửi thư qua Gmail, Outlook và hộp thư Tuturuuu được quản lý.',
      },
      indexable: false,
      keywords: [
        'team email',
        'shared mailbox',
        'workspace email',
        'business email',
      ],
      name: siteConfig.name,
      ogImage: siteConfig.ogImage,
      url: siteConfig.url,
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
          'overflow-hidden bg-root-background antialiased',
          font.className
        )}
      >
        <OfflineProvider register={false}>
          <VercelAnalytics />
          <VercelInsights />
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
