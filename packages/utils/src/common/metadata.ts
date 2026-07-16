import type { Metadata } from 'next';
import { DEV_MODE } from '../constants';

const TUTURUUU_URL = 'https://tuturuuu.com';
const DEFAULT_OG_IMAGE = `${TUTURUUU_URL}/media/logos/og-image.jpg`;

export const NO_INDEX_ROBOTS = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
  },
} satisfies NonNullable<Metadata['robots']>;

export interface CommonMetadataConfig {
  name: string;
  url: string;
  indexable: boolean;
  keywords: string[];
  description: {
    en: string;
    vi?: string;
  };
  authors?: Metadata['authors'];
  category?: string;
  creator?: string;
  icons?: Metadata['icons'];
  manifest?: string;
  ogImage?: string;
  publisher?: string;
}

export interface PageMetadataConfig {
  baseUrl: string;
  description: string;
  image?: string;
  imageAlt?: string;
  indexable?: boolean;
  keywords?: string[];
  locale: string;
  pathname: string;
  siteName?: string;
  socialDescription?: string;
  socialTitle?: string;
  title: string;
}

interface CreateCommonMetadataProps {
  config: CommonMetadataConfig;
  locale: string;
}

interface GenerateCommonMetadataProps {
  config: CommonMetadataConfig;
  params: Promise<{
    locale: string;
  }>;
}

interface GeneratePageMetadataProps {
  config: Omit<PageMetadataConfig, 'locale'>;
  params: Promise<{
    locale: string;
  }>;
}

function getOpenGraphLocale(locale: string) {
  return locale === 'vi' ? 'vi_VN' : 'en_US';
}

function getLocalizedUrl(baseUrl: string, locale: string, pathname: string) {
  const normalizedPathname =
    pathname === '/' ? '' : `/${pathname.replace(/^\/+|\/+$/g, '')}`;

  return new URL(`/${locale}${normalizedPathname}`, baseUrl).toString();
}

function getRobotsMetadata(indexable: boolean): Metadata['robots'] {
  if (!indexable) {
    return NO_INDEX_ROBOTS;
  }

  return {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  };
}

export function createCommonMetadata({
  config,
  locale,
}: CreateCommonMetadataProps): Metadata {
  const description =
    locale === 'vi' && config.description.vi
      ? config.description.vi
      : config.description.en;
  const ogImage = config.ogImage ?? DEFAULT_OG_IMAGE;
  const openGraphLocale = getOpenGraphLocale(locale);

  return {
    applicationName: config.name,
    title: {
      default: config.name,
      template: `${DEV_MODE ? '[DEV] ' : ''}%s | ${config.name}`,
    },
    metadataBase: new URL(config.url),
    description,
    keywords: [...new Set([config.name, 'Tuturuuu', ...config.keywords])],
    authors: config.authors ?? [
      {
        name: 'Tuturuuu',
        url: TUTURUUU_URL,
      },
    ],
    creator: config.creator ?? 'Tuturuuu',
    publisher: config.publisher ?? 'Tuturuuu',
    category: config.category,
    referrer: 'origin-when-cross-origin',
    robots: getRobotsMetadata(config.indexable),
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: config.name,
    },
    formatDetection: {
      address: false,
      email: false,
      telephone: false,
    },
    openGraph: {
      type: 'website',
      locale: openGraphLocale,
      alternateLocale: [openGraphLocale === 'vi_VN' ? 'en_US' : 'vi_VN'],
      title: config.name,
      description,
      siteName: config.name,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: `${config.name} preview`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: config.name,
      description,
      images: [ogImage],
      creator: '@tuturuuu',
      site: '@tuturuuu',
    },
    icons: config.icons ?? {
      icon: `${TUTURUUU_URL}/favicon.ico`,
      shortcut: `${TUTURUUU_URL}/favicon-16x16.png`,
      apple: `${TUTURUUU_URL}/apple-touch-icon.png`,
    },
    manifest: config.manifest,
  };
}

export function createPageMetadata({
  baseUrl,
  description,
  image = DEFAULT_OG_IMAGE,
  imageAlt,
  indexable,
  keywords,
  locale,
  pathname,
  siteName = 'Tuturuuu',
  title,
  socialDescription = description,
  socialTitle = title,
}: PageMetadataConfig): Metadata {
  const canonical = getLocalizedUrl(baseUrl, locale, pathname);
  const englishUrl = getLocalizedUrl(baseUrl, 'en', pathname);
  const vietnameseUrl = getLocalizedUrl(baseUrl, 'vi', pathname);
  const openGraphLocale = getOpenGraphLocale(locale);
  const absoluteImage = new URL(image, baseUrl).toString();

  return {
    title,
    description,
    ...(keywords?.length ? { keywords } : {}),
    ...(typeof indexable === 'boolean'
      ? { robots: getRobotsMetadata(indexable) }
      : {}),
    alternates: {
      canonical,
      languages: {
        'en-US': englishUrl,
        'vi-VN': vietnameseUrl,
        'x-default': englishUrl,
      },
    },
    openGraph: {
      type: 'website',
      url: canonical,
      locale: openGraphLocale,
      alternateLocale: [openGraphLocale === 'vi_VN' ? 'en_US' : 'vi_VN'],
      siteName,
      title: socialTitle,
      description: socialDescription,
      images: [
        {
          url: absoluteImage,
          width: 1200,
          height: 630,
          alt: imageAlt ?? socialTitle,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description: socialDescription,
      images: [absoluteImage],
      creator: '@tuturuuu',
      site: '@tuturuuu',
    },
  };
}

export async function generateCommonMetadata({
  config,
  params,
}: GenerateCommonMetadataProps): Promise<Metadata> {
  const { locale } = await params;
  return createCommonMetadata({ config, locale });
}

export async function generatePageMetadata({
  config,
  params,
}: GeneratePageMetadataProps): Promise<Metadata> {
  const { locale } = await params;
  return createPageMetadata({ ...config, locale });
}
