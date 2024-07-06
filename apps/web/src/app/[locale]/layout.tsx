import Navbar from './navbar';
import NavbarPadding from './navbar-padding';
import { StaffToolbar } from './staff-toolbar';
import { Providers } from '@/components/providers';
import { TailwindIndicator } from '@/components/tailwind-indicator';
import { locales } from '@/config';
import { siteConfig } from '@/constants/configs';
import { Toaster } from '@repo/ui/components/ui/toaster';
import '@repo/ui/globals.css';
import { cn } from '@repo/ui/lib/utils';
import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import { SpeedInsights as VercelInsights } from '@vercel/speed-insights/next';
import { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, unstable_setRequestLocale } from 'next-intl/server';
import { Inter } from 'next/font/google';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  params: {
    locale: string;
  };
}

export function generateMetadata({ params: { locale } }: Props): Metadata {
  const enDescription = 'Take control of your workflow, supercharged by AI.';
  const viDescription = 'Quản lý công việc của bạn, siêu tốc độ cùng AI.';

  const description = locale === 'vi' ? viDescription : enDescription;

  return {
    title: {
      default: siteConfig.name,
      template: `%s - ${siteConfig.name}`,
    },
    metadataBase: new URL(siteConfig.url),
    description,
    keywords: [
      'Next.js',
      'React',
      'Tailwind CSS',
      'Server Components',
      'Radix UI',
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
      creator: '@tutur3u',
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

const inter = Inter({ subsets: ['latin', 'vietnamese'], display: 'block' });

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
  children,
  params: { locale },
}: Props) {
  unstable_setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body
        className={cn(
          'bg-background min-h-screen font-sans antialiased',
          inter.className
        )}
      >
        <VercelAnalytics />
        <VercelInsights />
        <Providers
          attribute="class"
          defaultTheme="dark"
          themes={[
            'system',

            'light',
            'light-pink',
            'light-purple',
            'light-yellow',
            'light-orange',
            'light-green',
            'light-blue',

            'dark',
            'dark-pink',
            'dark-purple',
            'dark-yellow',
            'dark-orange',
            'dark-green',
            'dark-blue',
          ]}
          enableColorScheme={false}
          enableSystem
        >
          <NextIntlClientProvider messages={messages}>
            <Navbar />
            <NavbarPadding>{children}</NavbarPadding>
          </NextIntlClientProvider>
        </Providers>
        <TailwindIndicator />
        <StaffToolbar />
        <Toaster />
      </body>
    </html>
  );
}
