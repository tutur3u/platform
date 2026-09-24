import '@tuturuuu/meet-core/styles.css';
import '@tuturuuu/ui/globals.css';
import { Providers } from '@tuturuuu/satellite/providers';
import { Toaster } from '@tuturuuu/ui/sonner';
import { font, generateCommonMetadata } from '@tuturuuu/utils/common/nextjs';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  return generateCommonMetadata({
    params,
    config: {
      name: 'Tuturuuu Parley',
      keywords: ['scenario training', 'multiplayer simulation'],
      url: 'https://parley.tuturuuu.com',
      description: {
        en: 'Multiplayer scenario training and reflective research.',
        vi: 'Luyện tập tình huống nhiều người và nghiên cứu phản tư.',
      },
      indexable: false,
    },
  });
}
export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'vi' }];
}
export default async function Layout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!['en', 'vi'].includes(locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={`${font.className} bg-background text-foreground antialiased`}
      >
        <NuqsAdapter>
          <Providers appName="Tuturuuu Parley">{children}</Providers>
        </NuqsAdapter>
        <Toaster />
      </body>
    </html>
  );
}
