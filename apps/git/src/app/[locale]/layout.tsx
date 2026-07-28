import { ProductionIndicator } from '@tuturuuu/ui/custom/production-indicator';
import { StaffToolbar } from '@tuturuuu/ui/custom/staff-toolbar';
import { TailwindIndicator } from '@tuturuuu/ui/custom/tailwind-indicator';
import { Toaster } from '@tuturuuu/ui/sonner';
import { font, generateCommonMetadata } from '@tuturuuu/utils/common/nextjs';
import { cn } from '@tuturuuu/utils/format';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { type ReactNode, Suspense } from 'react';
import { Providers } from '@/components/providers';
import { BASE_URL } from '@/constants/common';
import { type Locale, routing, supportedLocales } from '@/i18n/routing';
import '@tuturuuu/ui/globals.css';
import 'streamdown/styles.css';
import '../git.css';

export { viewport } from '@tuturuuu/utils/common/nextjs';

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return generateCommonMetadata({
    config: {
      description: {
        en: 'Browse public source code, issues, pull requests, releases, and CI activity at Tuturuuu speed.',
        vi: 'Duyệt mã nguồn công khai, issue, pull request, bản phát hành và hoạt động CI với tốc độ Tuturuuu.',
      },
      indexable: true,
      keywords: ['Git', 'GitHub', 'source code', 'pull requests', 'Tuturuuu'],
      name: 'Tuturuuu Git',
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
          'min-h-screen overflow-y-auto bg-root-background text-foreground antialiased',
          font.className
        )}
      >
        <NuqsAdapter>
          <Suspense fallback={null}>
            <Providers appName="Tuturuuu Git">{children}</Providers>
          </Suspense>
        </NuqsAdapter>
        <TailwindIndicator />
        <ProductionIndicator />
        <StaffToolbar />
        <Toaster />
      </body>
    </html>
  );
}
