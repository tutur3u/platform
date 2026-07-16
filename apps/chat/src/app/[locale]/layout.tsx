import { SerwistProvider } from '@tuturuuu/offline/provider';
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
        en: 'Chat is a private Tuturuuu workspace messaging app for direct messages, groups, channels, AI conversations, and Drive-backed file attachments.',
        vi: 'Chat là ứng dụng nhắn tin riêng tư của Tuturuuu cho tin nhắn trực tiếp, nhóm, kênh, cuộc trò chuyện AI và tệp đính kèm từ Drive.',
      },
      indexable: false,
      keywords: [
        'workspace chat',
        'team messaging',
        'AI chat',
        'file collaboration',
      ],
      name: 'Chat',
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
        <SerwistProvider register={false}>
          <VercelAnalytics />
          <VercelInsights />
          <Suspense>
            <Providers>
              <NextIntlClientProvider>
                {children}
                <Suspense fallback={null}>
                  <SatelliteVersionBadge appName="Chat" />
                </Suspense>
              </NextIntlClientProvider>
            </Providers>
          </Suspense>
          <TailwindIndicator />
          <ProductionIndicator />
          <StaffToolbar />
          <Toaster />
        </SerwistProvider>
      </body>
    </html>
  );
}
