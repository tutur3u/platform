import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { StaffToolbar } from '@tuturuuu/ui/custom/staff-toolbar';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { siteConfig } from '@/constants/configs';
import { supportedLocales } from '@/i18n/routing';
import '@tuturuuu/ui/globals.css';
import { Toaster } from '@tuturuuu/ui/sonner';
import { font, generateCommonMetadata } from '@tuturuuu/utils/common/nextjs';
import { cn } from '@tuturuuu/utils/format';
import { resolveRootLocale } from '@tuturuuu/utils/i18n-root-locale';
import type { Metadata } from 'next';
import { locale as getRootLocale } from 'next/root-params';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { Providers } from './providers';

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
      indexable: false,
      keywords: [
        'meeting scheduler',
        'availability planner',
        'collaborative scheduling',
        'meeting coordination',
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

export default async function RootLayout({ children }: Props) {
  const locale = await resolveRootLocale(
    supportedLocales,
    await getRootLocale()
  );

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={cn(
          'overflow-y-auto bg-root-background antialiased',
          font.className
        )}
      >
        <NuqsAdapter>
          <Providers
            appName={siteConfig.name}
            loadingFallback={
              <div
                className="flex min-h-dvh items-center justify-center bg-background"
                role="progressbar"
                aria-label="Tuturuuu Meet"
              >
                <div className="flex flex-col items-center gap-5">
                  <span className="font-semibold text-xl tracking-tight">
                    Tuturuuu Meet
                  </span>
                  <span className="h-1 w-24 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full w-1/2 rounded-full bg-foreground/30 motion-safe:animate-pulse" />
                  </span>
                </div>
              </div>
            }
          >
            {children}
          </Providers>
        </NuqsAdapter>
        <TailwindIndicator />
        <ProductionIndicator />
        <StaffToolbar />
        <Toaster />
      </body>
    </html>
  );
}
