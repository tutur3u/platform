import { SatelliteVersionBadge } from '@tuturuuu/satellite/version-badge';
import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { StaffToolbar } from '@tuturuuu/ui/custom/staff-toolbar';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { Toaster } from '@tuturuuu/ui/sonner';
import { font, generateCommonMetadata } from '@tuturuuu/utils/common/nextjs';
import { cn } from '@tuturuuu/utils/format';
import { resolveRootLocale } from '@tuturuuu/utils/i18n-root-locale';
import type { Metadata } from 'next';
import { locale as getRootLocale } from 'next/root-params';
import { NextIntlClientProvider } from 'next-intl';
import { type ReactNode, Suspense } from 'react';
import { TeachQueryProvider } from '@/components/teach-query-provider';
import { TeachThemeProvider } from '@/components/teach-theme-provider';
import { BASE_URL } from '@/constants/common';
import { supportedLocales } from '@/i18n/routing';
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
        en: 'Teach gives educators a focused companion surface for planning classroom loops, opening Tuturuuu workspace tools, and previewing the learner experience.',
        vi: 'Teach là bề mặt hỗ trợ giáo viên lên kế hoạch lớp học, mở công cụ workspace Tuturuuu và xem trước trải nghiệm học viên.',
      },
      indexable: true,
      keywords: [
        'teacher portal',
        'classroom planning',
        'education platform',
        'learning management',
      ],
      name: 'Teach',
      url: BASE_URL,
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
          'overflow-y-auto bg-root-background text-foreground antialiased',
          font.className
        )}
      >
        <Suspense fallback={null}>
          <NextIntlClientProvider>
            <TeachThemeProvider>
              <TeachQueryProvider>
                {children}
                <Suspense fallback={null}>
                  <SatelliteVersionBadge appName="Teach" />
                </Suspense>
              </TeachQueryProvider>
            </TeachThemeProvider>
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
