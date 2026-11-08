export const TUTURUUU_URL = 'https://tuturuuu.com';
export const DEFAULT_OG_IMAGE = `${TUTURUUU_URL}/media/logos/og-image.jpg`;

export const NO_INDEX_ROBOTS = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
  },
};

export interface PageMetadataConfig {
  baseUrl: string;
  description: string;
  image?: string;
  imageAlt?: string;
  indexable?: boolean;
  keywords?: string[];
  locale: string;
  localePrefix?: 'always' | 'as-needed' | 'never';
  pathname: string;
  siteName?: string;
  socialDescription?: string;
  socialTitle?: string;
  title: string;
}

export function getOpenGraphLocale(locale: string) {
  return locale === 'vi' ? 'vi_VN' : 'en_US';
}

function trimSlashes(value: string) {
  let start = 0;
  let end = value.length;

  while (start < end && value[start] === '/') start += 1;
  while (end > start && value[end - 1] === '/') end -= 1;

  return value.slice(start, end);
}

function getLocalizedUrl(
  baseUrl: string,
  locale: string,
  pathname: string,
  localePrefix: NonNullable<PageMetadataConfig['localePrefix']>
) {
  const normalizedPathname =
    pathname === '/' ? '' : `/${trimSlashes(pathname)}`;
  const localizedPrefix =
    localePrefix === 'never' ||
    (localePrefix === 'as-needed' && locale === 'en')
      ? ''
      : `/${locale}`;
  const localizedPathname = `${localizedPrefix}${normalizedPathname}` || '/';

  return new URL(localizedPathname, baseUrl).toString();
}

export function getRobotsMetadata(indexable: boolean) {
  if (!indexable) {
    return NO_INDEX_ROBOTS;
  }

  return {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large' as const,
      'max-snippet': -1,
      'max-video-preview': -1,
    },
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
  localePrefix = 'as-needed',
  pathname,
  siteName = 'Tuturuuu',
  title,
  socialDescription = description,
  socialTitle = title,
}: PageMetadataConfig) {
  const canonical = getLocalizedUrl(baseUrl, locale, pathname, localePrefix);
  const englishUrl = getLocalizedUrl(baseUrl, 'en', pathname, localePrefix);
  const vietnameseUrl = getLocalizedUrl(baseUrl, 'vi', pathname, localePrefix);
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
      ...(localePrefix === 'never'
        ? {}
        : {
            languages: {
              'en-US': englishUrl,
              'vi-VN': vietnameseUrl,
              'x-default': englishUrl,
            },
          }),
    },
    openGraph: {
      type: 'website' as const,
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
      card: 'summary_large_image' as const,
      title: socialTitle,
      description: socialDescription,
      images: [absoluteImage],
      creator: '@tuturuuu',
      site: '@tuturuuu',
    },
  };
}

export function createSiteTitle(name: string, development = false) {
  return {
    default: name,
    template: `${development ? '[DEV] ' : ''}%s | ${name}`,
  };
}
