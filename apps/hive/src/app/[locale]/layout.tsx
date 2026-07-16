import { SerwistProvider } from '@tuturuuu/offline/provider';
import { SatelliteVersionBadge } from '@tuturuuu/satellite/version-badge';
import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { StaffToolbar } from '@tuturuuu/ui/custom/staff-toolbar';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { Toaster } from '@tuturuuu/ui/sonner';
import { generateCommonMetadata } from '@tuturuuu/utils/common/metadata';
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
import { HIVE_BODY_CLASS_NAME } from './layout-classes';
import '@xyflow/react/dist/style.css';
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
  return generateCommonMetadata({
    config: {
      description: {
        en: 'Hive is Tuturuuu’s voxel research engine for social simulation, AI NPCs, and agentic behavior experiments.',
        vi: 'Hive là phòng thí nghiệm voxel của Tuturuuu dành cho mô phỏng xã hội, NPC dùng AI và nghiên cứu hành vi tác tử.',
      },
      indexable: false,
      keywords: [
        'social simulation',
        'AI NPCs',
        'agentic behavior',
        'voxel research',
      ],
      name: 'Tuturuuu Hive',
      url: BASE_URL,
    },
    params,
  });
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
      <body className={cn(HIVE_BODY_CLASS_NAME, outfit.className)}>
        <SerwistProvider register={false}>
          <VercelAnalytics />
          <VercelInsights />
          <Suspense>
            <Providers>
              <NextIntlClientProvider>
                {children}
                <Suspense fallback={null}>
                  <SatelliteVersionBadge appName="Hive" />
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
