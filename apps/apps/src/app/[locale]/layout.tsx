import '@tuturuuu/ui/globals.css';

import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { Toaster } from '@tuturuuu/ui/sonner';
import { font } from '@tuturuuu/utils/common/nextjs';
import { cn } from '@tuturuuu/utils/format';
import { VercelAnalytics, VercelInsights } from '@tuturuuu/vercel';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { BASE_URL } from '@/constants/common';
import { type Locale, routing, supportedLocales } from '@/i18n/routing';

export { viewport } from '@tuturuuu/utils/common/nextjs';

export const metadata: Metadata = {
  description:
    'Central Tuturuuu app gateway for opening workspace, productivity, learning, and developer apps.',
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Tuturuuu Apps',
    template: '%s | Tuturuuu Apps',
  },
};

interface Props {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
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
          'min-h-screen overflow-y-auto bg-root-background text-foreground antialiased',
          font.className
        )}
      >
        <VercelAnalytics />
        <VercelInsights />
        <Suspense>
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </Suspense>
        <TailwindIndicator />
        <Toaster />
      </body>
    </html>
  );
}
