import '../../styles/globals.css';

import { Toaster } from '@/components/ui/toaster';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { siteConfig } from '@/constants/configs';
import { Metadata, Viewport } from 'next';
import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import Navbar from './navbar';
import NavbarPadding from './navbar-padding';
import { StaffToolbar } from './staff-toolbar';
import { TailwindIndicator } from '@/components/tailwind-indicator';
import { Providers } from '@/components/providers';

interface Props {
  children: ReactNode;
  params: {
    lang: string;
  };
}

export async function generateMetadata({
  params: { lang },
}: Props): Promise<Metadata> {
  const enDescription = 'Take control of your workflow, supercharged by AI.';
  const viDescription = 'Quản lý công việc của bạn, siêu tốc độ cùng AI.';

  const description =
    lang === 'en'
      ? enDescription
      : lang === 'vi'
      ? viDescription
      : enDescription;

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
      locale: 'en_US',
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

export async function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'vi' }];
}

export default async function RootLayout({ children, params }: Props) {
  return (
    <html lang={params.lang}>
      <body
        className={cn(
          'bg-background min-h-screen font-sans antialiased'
          // fontSans.variable
        )}
      >
        <VercelAnalytics />
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
          <Navbar />
          <NavbarPadding>{children}</NavbarPadding>
        </Providers>
        <TailwindIndicator />
        <StaffToolbar />
        <Toaster />
      </body>
    </html>
  );
}
