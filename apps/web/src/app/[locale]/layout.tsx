import { Providers } from '@/components/providers';
import { siteConfig } from '@/constants/configs';
import { type Locale, routing, supportedLocales } from '@/i18n/routing';
import '@/style/prosemirror.css';
import '@/style/react-easy-crop.css';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import '@tuturuuu/ui/globals.css';
import '@tuturuuu/tasks-ui/globals.css';
import { Toaster } from '@tuturuuu/ui/sonner';
import { font, generateCommonMetadata } from '@tuturuuu/utils/common/nextjs';
import { cn } from '@tuturuuu/utils/format';
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

async function ServiceWorkerBoundary({
  children,
  serviceWorkerUrl,
}: {
  children: ReactNode;
  serviceWorkerUrl: string;
}) {
  if (process.env.NODE_ENV === 'development') {
    return <>{children}</>;
  }

  const { SerwistProvider } = await import('@tuturuuu/offline/provider');

  return (
    <SerwistProvider
      options={{ updateViaCache: 'none' }}
      swUrl={serviceWorkerUrl}
    >
      {children}
    </SerwistProvider>
  );
}

async function VercelRuntimeSignals() {
  const isVercelDeployment =
    process.env.VERCEL === '1' || Boolean(process.env.VERCEL_URL);

  if (!isVercelDeployment) {
    return null;
  }

  const { VercelAnalytics, VercelInsights } = await import('@tuturuuu/vercel');

  return (
    <>
      <VercelAnalytics />
      <VercelInsights />
    </>
  );
}

async function ProductionDatabaseIndicator() {
  const isProductionDatabase =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('.supabase.');
  const isProductionRuntime = process.env.NODE_ENV === 'production';

  if (!isProductionDatabase || isProductionRuntime) {
    return null;
  }

  const { ProductionIndicator } = await import(
    '@tuturuuu/ui/custom/production-indicator'
  );

  return <ProductionIndicator />;
}

export default async function RootLayout({ children, params }: Props) {
  const { locale } = await params;
  const deploymentStamp =
    process.env.PLATFORM_DEPLOYMENT_STAMP?.trim() || 'local';
  const serviceWorkerUrl = `/serwist/sw.js?v=${encodeURIComponent(deploymentStamp)}`;

  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  setRequestLocale(locale as Locale);

  return (
    <html lang={locale} suppressHydrationWarning data-scroll-behavior="smooth">
      <body
        className={cn(
          'overflow-y-auto bg-root-background antialiased',
          font.className
        )}
      >
        <ServiceWorkerBoundary serviceWorkerUrl={serviceWorkerUrl}>
          <VercelRuntimeSignals />
          <Suspense>
            <NuqsAdapter>
              <Providers>{children}</Providers>
            </NuqsAdapter>
          </Suspense>
          <TailwindIndicator />
          <ProductionDatabaseIndicator />
          <Toaster />
        </ServiceWorkerBoundary>
      </body>
    </html>
  );
}
