import '../../styles/globals.css';
import { ReactNode } from 'react';

import { Analytics as VercelAnalytics } from '@vercel/analytics/react';
import { SpeedInsights as VercelInsights } from '@vercel/speed-insights/next';
import { siteConfig } from '@/constants/configs';
import { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface Props {
  children: ReactNode;
}

export async function generateMetadata(): Promise<Metadata> {
  const description = 'Take control of your workflow, supercharged by AI.';

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

const inter = Inter({ subsets: ['latin', 'vietnamese'], display: 'block' });

export default async function RootLayout({ children }: Props) {
  return (
    <html lang="en">
      <body
        className={cn(
          'bg-background min-h-screen font-sans antialiased',
          inter.className
        )}
      >
        <VercelAnalytics />
        <VercelInsights />
        {children}
      </body>
    </html>
  );
}
