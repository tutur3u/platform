import { FadeSettingInitializer } from '@/components/fade-setting-initializer';
import { Providers } from '@/components/providers';
import { siteConfig } from '@/constants/configs';
import { type Locale, routing, supportedLocales } from '@/i18n/routing';
import '@mantine/core/styles.layer.css';
import '@mantine/charts/styles.layer.css';
import '@/style/prosemirror.css';
import { SerwistProvider } from '@tuturuuu/offline/provider';
import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { StaffToolbar } from '@tuturuuu/ui/custom/staff-toolbar';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import '@tuturuuu/ui/globals.css';
import { Toaster } from '@tuturuuu/ui/sonner';
import { font, generateCommonMetadata } from '@tuturuuu/utils/common/nextjs';
import { ReactScan } from '@tuturuuu/utils/common/scan';
import { cn } from '@tuturuuu/utils/format';
import { VercelAnalytics, VercelInsights } from '@tuturuuu/vercel';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { type ReactNode, Suspense } from 'react';

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
        en: 'Take control of your workflow, supercharged by AI.',
        vi: 'Quản lý công việc của bạn, siêu tốc độ cùng AI.',
      },
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

  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale as Locale)) {
    console.error('Invalid locale:', locale);
    notFound();
  }

  setRequestLocale(locale as Locale);

  return (
    <html
      lang={locale}
      className="scroll-smooth text-pretty"
      suppressHydrationWarning
    >
      <ReactScan />
      <body
        className={cn(
          'overflow-y-auto bg-root-background antialiased',
          font.className
        )}
      >
        <SerwistProvider>
          <VercelAnalytics />
          <VercelInsights />
          <Suspense>
            <NuqsAdapter>
              <Providers>
                <FadeSettingInitializer />
                {children}
              </Providers>
            </NuqsAdapter>
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
