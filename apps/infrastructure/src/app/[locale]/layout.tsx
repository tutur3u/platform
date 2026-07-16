import { siteConfig } from '@/constants/configs';
import { type Locale, routing, supportedLocales } from '@/i18n/routing';
import '@tuturuuu/ui/globals.css';
import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { StaffToolbar } from '@tuturuuu/ui/custom/staff-toolbar';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { Toaster } from '@tuturuuu/ui/sonner';
import { font, generateCommonMetadata } from '@tuturuuu/utils/common/nextjs';
import { cn } from '@tuturuuu/utils/format';
import { VercelAnalytics, VercelInsights } from '@tuturuuu/vercel';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import { Providers } from '@/components/providers';

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
        en: 'Dedicated control surface for Tuturuuu infrastructure operations.',
        vi: 'Be mat dieu khien rieng cho van hanh ha tang Tuturuuu.',
      },
      indexable: false,
      keywords: [
        'infrastructure operations',
        'observability',
        'deployment management',
        'system administration',
      ],
      name: siteConfig.name,
      url: siteConfig.url,
      ogImage: siteConfig.ogImage,
    },
    params,
  });
}

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
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
          'min-h-screen overflow-y-auto bg-root-background antialiased',
          font.className
        )}
      >
        <VercelAnalytics />
        <VercelInsights />
        <Suspense fallback={null}>
          <Providers appName={siteConfig.name}>{children}</Providers>
        </Suspense>
        <TailwindIndicator />
        <ProductionIndicator />
        <StaffToolbar />
        <Toaster />
      </body>
    </html>
  );
}
