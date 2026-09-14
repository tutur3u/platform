import { generateCommonMetadata } from '@tuturuuu/utils/common/nextjs';
import { resolveRootLocale } from '@tuturuuu/utils/i18n-root-locale';
import { locale as getRootLocale } from 'next/root-params';
import { NextIntlClientProvider } from 'next-intl';
import { type ReactNode, Suspense } from 'react';
import { Providers } from '@/components/providers';
import { BASE_URL } from '@/constants/common';
import { supportedLocales } from '@/i18n/routing';
import '@tuturuuu/ui/globals.css';
import './notebook.css';
export function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  return generateCommonMetadata({
    config: {
      name: '(Tu)lettin',
      url: BASE_URL,
      indexable: true,
      keywords: ['worldbuilding', 'characters', 'stories', 'wiki'],
      description: {
        en: 'A home for the worlds you create.',
        vi: 'Ngôi nhà cho những thế giới bạn sáng tạo.',
      },
    },
    params,
  });
}

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}
export default async function Layout({ children }: { children: ReactNode }) {
  const locale = await resolveRootLocale(
    supportedLocales,
    await getRootLocale()
  );
  return (
    <html lang={locale}>
      <body>
        <Suspense>
          <NextIntlClientProvider>
            <Providers>{children}</Providers>
          </NextIntlClientProvider>
        </Suspense>
      </body>
    </html>
  );
}
