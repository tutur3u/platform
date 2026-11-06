import type { Metadata } from 'next';
import { DEV_MODE } from '../constants';
import {
  createPageMetadata as createPortablePageMetadata,
  createSiteTitle,
  DEFAULT_OG_IMAGE,
  getOpenGraphLocale,
  getRobotsMetadata,
  type PageMetadataConfig,
  TUTURUUU_URL,
} from './page-metadata';

export { NO_INDEX_ROBOTS, type PageMetadataConfig } from './page-metadata';

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
    title: createSiteTitle(config.name, DEV_MODE),
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

export function createPageMetadata(config: PageMetadataConfig): Metadata {
  return createPortablePageMetadata(config);
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
