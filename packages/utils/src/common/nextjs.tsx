import type { Metadata, Viewport } from 'next';
import { Noto_Sans } from 'next/font/google';
import { DEV_MODE } from '../constants';

export const font = Noto_Sans({
  subsets: ['latin', 'vietnamese'],
  display: 'block',
});

interface MetadataProps {
  config: {
    name: string;
    url: string;
    ogImage: string;
    keywords?: string[];
    description: {
      en: string;
      vi?: string;
    };
  };
  params: Promise<{
    locale: string;
  }>;
}

export async function generateCommonMetadata({
  config,
  params,
}: MetadataProps): Promise<Metadata> {
  const { locale } = await params;
  const description =
    locale === 'vi' ? config.description.vi : config.description.en;

  return {
    applicationName: config.name,
    title: {
      default: config.name,
      template: `${DEV_MODE ? '[DEV] ' : ''} %s | ${config.name}`,
    },
    metadataBase: new URL(config.url),
    description,
    keywords: config.keywords ?? [
      'React.js',
      'Next.js',
      'Tailwind CSS',
      'TypeScript',
      'Biome',
    ],
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: config.name,
    },
    formatDetection: {
      telephone: false,
    },
    openGraph: {
      type: 'website',
      locale,
      url: config.url,
      title: config.name,
      description,
      siteName: config.name,
      images: [
        {
          url: config.ogImage,
          width: 1200,
          height: 630,
          alt: config.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: config.name,
      description,
      images: [config.ogImage],
      creator: '@tuturuuu',
    },
    icons: {
      icon: '/favicon.ico',
      shortcut: '/favicon-16x16.png',
      apple: '/apple-touch-icon.png',
    },
    manifest: '/manifest.webmanifest',
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
