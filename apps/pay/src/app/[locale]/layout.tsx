import { SatelliteVersionBadge } from '@tuturuuu/satellite/version-badge';
import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { StaffToolbar } from '@tuturuuu/ui/custom/staff-toolbar';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { Toaster } from '@tuturuuu/ui/sonner';
import { font, generateCommonMetadata } from '@tuturuuu/utils/common/nextjs';
import { cn } from '@tuturuuu/utils/format';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import { PayQueryProvider } from '@/components/pay-query-provider';
import { PayThemeProvider } from '@/components/pay-theme-provider';
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
        en: 'Pay is the Tuturuuu billing surface for managing workspace subscriptions, seats, invoices, and payment methods.',
        vi: 'Pay là bề mặt thanh toán của Tuturuuu để quản lý gói đăng ký workspace, chỗ ngồi, hóa đơn và phương thức thanh toán.',
      },
      indexable: false,
      keywords: [
        'subscription billing',
        'invoice management',
        'workspace billing',
        'payment methods',
      ],
      name: 'Pay',
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
          'overflow-y-auto bg-root-background text-foreground antialiased',
          font.className
        )}
      >
        <Suspense fallback={null}>
          <NextIntlClientProvider>
            <PayThemeProvider>
              <PayQueryProvider>
                {children}
                <Suspense fallback={null}>
                  <SatelliteVersionBadge appName="Pay" />
                </Suspense>
              </PayQueryProvider>
            </PayThemeProvider>
          </NextIntlClientProvider>
        </Suspense>
        <TailwindIndicator />
        <ProductionIndicator />
        <StaffToolbar />
        <Toaster />
      </body>
    </html>
  );
}
