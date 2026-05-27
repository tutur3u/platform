import { SerwistProvider } from '@tuturuuu/offline/provider';
import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { StaffToolbar } from '@tuturuuu/ui/custom/staff-toolbar';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { Toaster } from '@tuturuuu/ui/sonner';
import { font, generateCommonMetadata } from '@tuturuuu/utils/common/nextjs';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { VercelAnalytics, VercelInsights } from '@tuturuuu/vercel';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { Providers } from '@/components/providers';
import { siteConfig } from '@/constants/configs';
import { type Locale, routing, supportedLocales } from '@/i18n/routing';
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
        en: 'Send and receive Tuturuuu team mailboxes for exact @tuturuuu.com accounts.',
        vi: 'Gửi và nhận hộp thư nhóm Tuturuuu cho các tài khoản chính xác @tuturuuu.com.',
      },
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

export default async function RootLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  setRequestLocale(locale as Locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={cn(
          'overflow-hidden bg-root-background antialiased',
          font.className
        )}
      >
        <SerwistProvider>
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
        </SerwistProvider>
      </body>
    </html>
  );
}
