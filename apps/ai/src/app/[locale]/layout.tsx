import { Providers } from '@tuturuuu/satellite/providers';
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
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { BASE_URL } from '@/constants/common';
import { type Locale, routing, supportedLocales } from '@/i18n/routing';
import '@tuturuuu/ui/globals.css';

export { viewport } from '@tuturuuu/utils/common/nextjs';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return generateCommonMetadata({
    config: {
      name: 'AI Studio',
      description: {
        en: 'Build, evaluate, and observe reliable AI systems with Tuturuuu.',
        vi: 'Xây dựng, đánh giá và quan sát hệ thống AI đáng tin cậy cùng Tuturuuu.',
      },
      indexable: false,
      keywords: ['AI Studio', 'AI evaluation', 'AI observability'],
      url: BASE_URL,
    },
    params,
  });
}

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as Locale)) notFound();
  setRequestLocale(locale as Locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={cn(
          'min-h-screen bg-background text-foreground antialiased',
          font.className
        )}
      >
        <VercelAnalytics />
        <VercelInsights />
        <NuqsAdapter>
          <Suspense>
            <Providers appName="AI Studio" currentApp="ai">
              {children}
              <ProductionIndicator />
              <StaffToolbar />
              <TailwindIndicator />
            </Providers>
          </Suspense>
        </NuqsAdapter>
        <Toaster />
      </body>
    </html>
  );
}
