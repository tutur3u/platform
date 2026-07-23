import { OfflineProvider } from '@tuturuuu/offline/provider';
import { SatelliteVersionBadge } from '@tuturuuu/satellite/version-badge';
import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { StaffToolbar } from '@tuturuuu/ui/custom/staff-toolbar';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { Toaster } from '@tuturuuu/ui/sonner';
import { font, generateCommonMetadata } from '@tuturuuu/utils/common/nextjs';
import { cn } from '@tuturuuu/utils/format';
import { VercelAnalytics, VercelInsights } from '@tuturuuu/vercel';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { Providers } from '@/components/providers';
import { BASE_URL } from '@/constants/common';
import { type Locale, routing, supportedLocales } from '@/i18n/routing';
import '@xyflow/react/dist/style.css';
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
        en: 'Mind is a Tuturuuu planning canvas for mindboards, knowledge graphs, nested ideas, and AI-aided long-range planning.',
        vi: 'Mind là không gian Tuturuuu để lập kế hoạch bằng mindboard, đồ thị tri thức, ý tưởng lồng nhau và AI hỗ trợ hoạch định dài hạn.',
      },
      indexable: false,
      keywords: [
        'mind mapping',
        'knowledge graphs',
        'visual planning',
        'AI brainstorming',
      ],
      name: 'Mind',
      url: BASE_URL,
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
          'overflow-hidden bg-root-background text-foreground antialiased',
          font.className
        )}
      >
        <OfflineProvider register={false}>
          <VercelAnalytics />
          <VercelInsights />
          <Suspense>
            <Providers>
              <NextIntlClientProvider>
                {children}
                <Suspense fallback={null}>
                  <SatelliteVersionBadge appName="Mind" />
                </Suspense>
              </NextIntlClientProvider>
            </Providers>
          </Suspense>
          <TailwindIndicator />
          <ProductionIndicator />
          <StaffToolbar />
          <Toaster />
        </OfflineProvider>
      </body>
    </html>
  );
}
