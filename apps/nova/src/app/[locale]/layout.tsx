import { VersionBadgeGate } from '@/components/version-badge-gate';
import { siteConfig } from '@/constants/configs';
import { type Locale, routing, supportedLocales } from '@/i18n/routing';
import '@tuturuuu/ui/globals.css';
import { Toaster } from '@tuturuuu/ui/sonner';
import { generateCommonMetadata } from '@tuturuuu/utils/common/metadata';
import { cn } from '@tuturuuu/utils/format';
import { VercelAnalytics, VercelInsights } from '@tuturuuu/vercel';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { type ReactNode, Suspense } from 'react';
import { Providers } from './providers';

const font = Inter({ subsets: ['latin', 'vietnamese'], display: 'block' });

interface Props {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return generateCommonMetadata({
    config: {
      authors: [
        {
          name: 'Võ Hoàng Phúc',
          url: 'https://www.vohoangphuc.com',
        },
      ],
      category: 'education',
      creator: 'Võ Hoàng Phúc',
      description: {
        en: 'Master prompt engineering with interactive challenges, comprehensive learning resources, and AI-powered tools.',
        vi: 'Làm chủ kỹ thuật prompt với các thử thách tương tác, tài liệu học tập toàn diện và công cụ AI.',
      },
      indexable: true,
      keywords: [
        'prompt engineering',
        'AI education',
        'large language models',
        'AI training',
        'interactive AI challenges',
      ],
      name: siteConfig.name,
      ogImage: siteConfig.ogImage,
      url: siteConfig.url,
    },
    params,
  });
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: 'black' },
    { media: '(prefers-color-scheme: light)', color: 'white' },
  ],
  colorScheme: 'dark light',
};

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export default async function RootLayout({ children, params }: Props) {
  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes((await params).locale as Locale)) {
    notFound();
  }

  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <body
        className={cn(
          'w-screen overflow-x-hidden overflow-y-scroll bg-background antialiased',
          font.className
        )}
      >
        <VercelAnalytics />
        <VercelInsights />
        <Suspense>
          <Providers>
            <NextIntlClientProvider>
              {children}
              <Suspense fallback={null}>
                <VersionBadgeGate />
              </Suspense>
            </NextIntlClientProvider>
          </Providers>
        </Suspense>
        <Toaster />
      </body>
    </html>
  );
}
