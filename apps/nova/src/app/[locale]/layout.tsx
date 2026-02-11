import { siteConfig } from '@/constants/configs';
import { type Locale, routing, supportedLocales } from '@/i18n/routing';
import '@tuturuuu/ui/globals.css';
import { Toaster } from '@tuturuuu/ui/sonner';
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
  const { locale } = await params;

  const enDescription =
    'Master the art of prompt engineering with interactive challenges, comprehensive learning resources, and AI-powered tools.';
  const viDescription =
    'Làm chủ nghệ thuật prompt engineering với các thử thách tương tác, tài liệu học tập toàn diện và công cụ được hỗ trợ bởi AI.';

  const description = locale === 'vi' ? viDescription : enDescription;

  return {
    title: {
      default: siteConfig.name,
      template: `%s - ${siteConfig.name}`,
    },
    metadataBase: new URL(siteConfig.url),
    description,
    keywords: [
      'Prompt Engineering',
      'AI',
      'Machine Learning',
      'Next.js',
      'React',
      'Artificial Intelligence',
      'LLM',
      'Large Language Models',
      'AI Training',
      'AI Education',
    ],
    authors: [
      {
        name: 'vohoangphuc',
        url: 'https://www.vohoangphuc.com',
      },
    ],
    creator: 'vohoangphuc',
    openGraph: {
      type: 'website',
      locale,
      url: siteConfig.url,
      title: siteConfig.name,
      description,
      siteName: siteConfig.name,
      images: [
        {
          url: siteConfig.ogImage,
          width: 1200,
          height: 630,
          alt: siteConfig.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: siteConfig.name,
      description,
      images: [siteConfig.ogImage],
      creator: '@tuturuuu',
    },
    icons: {
      icon: '/favicon.ico',
      shortcut: '/favicon-16x16.png',
      apple: '/apple-touch-icon.png',
    },
    manifest: `/site.webmanifest`,
  };
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
            <NextIntlClientProvider>{children}</NextIntlClientProvider>
          </Providers>
        </Suspense>
        <Toaster />
      </body>
    </html>
  );
}
