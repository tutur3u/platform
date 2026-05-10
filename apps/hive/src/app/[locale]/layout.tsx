import { SerwistProvider } from '@tuturuuu/offline/provider';
import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { StaffToolbar } from '@tuturuuu/ui/custom/staff-toolbar';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { Toaster } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { VercelAnalytics, VercelInsights } from '@tuturuuu/vercel';
import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import { Providers } from '@/components/providers';
import { BASE_URL } from '@/constants/common';
import { type Locale, routing, supportedLocales } from '@/i18n/routing';
import '@tuturuuu/ui/globals.css';

const outfit = Outfit({
  display: 'swap',
  subsets: ['latin'],
  variable: '--font-hive',
});

interface Props {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const description =
    locale === 'vi'
      ? 'Hive là phòng thí nghiệm voxel của Tuturuuu dành cho mô phỏng xã hội, NPC dùng AI và nghiên cứu hành vi tác tử.'
      : 'Hive is Tuturuuu’s voxel research engine for social simulation, AI NPCs, and agentic behavior experiments.';

  return {
    title: {
      default: 'Hive',
      template: '%s - Hive',
    },
    metadataBase: new URL(BASE_URL),
    description,
    openGraph: {
      description,
      siteName: 'Hive',
      title: 'Hive',
      type: 'website',
      url: BASE_URL,
    },
  };
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#18181b',
  width: 'device-width',
};

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
    <html className="dark" lang={locale} suppressHydrationWarning>
      <body
        className={cn(
          'min-h-dvh overflow-hidden bg-zinc-950 text-zinc-50 antialiased',
          outfit.className
        )}
      >
        <SerwistProvider register={false}>
          <VercelAnalytics />
          <VercelInsights />
          <Suspense>
            <Providers>
              <NextIntlClientProvider>{children}</NextIntlClientProvider>
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
