import {
  createPageMetadata,
  generatePageMetadata,
  type PageMetadataConfig,
} from '@tuturuuu/utils/common/metadata';
import { getTranslations } from 'next-intl/server';
import { siteConfig } from '@/constants/configs';

type MarketingMetadataConfig = Omit<PageMetadataConfig, 'baseUrl' | 'locale'>;

interface MarketingMetadataProps {
  params: Promise<{
    locale: string;
  }>;
}

export function createMarketingMetadata(config: MarketingMetadataConfig) {
  return ({ params }: MarketingMetadataProps) =>
    generatePageMetadata({
      config: {
        ...config,
        baseUrl: siteConfig.url,
        indexable: config.indexable ?? true,
        localePrefix: 'as-needed',
        siteName: config.siteName ?? siteConfig.name,
      },
      params,
    });
}

export function getMarketingMetadata(
  config: MarketingMetadataConfig,
  locale: string
) {
  return createPageMetadata({
    ...config,
    baseUrl: siteConfig.url,
    indexable: config.indexable ?? true,
    locale,
    localePrefix: 'as-needed',
    siteName: config.siteName ?? siteConfig.name,
  });
}

/**
 * Marketing metadata whose title and description come from the message
 * bundles rather than a literal.
 *
 * `createMarketingMetadata` takes static English copy, which meant every
 * `/vi/*` marketing page served English metadata to search engines and link
 * previews — the page localized, its title did not.
 *
 * The namespace supplies `title` and `description`. Everything else about the
 * page — canonical URL, locale prefixing, indexability — is unchanged, because
 * only the copy was ever the problem.
 */
export function createLocalizedMarketingMetadata({
  namespace,
  ...config
}: Omit<MarketingMetadataConfig, 'title' | 'description'> & {
  /** Message namespace holding `title` and `description`. */
  namespace: string;
}) {
  return async ({ params }: MarketingMetadataProps) => {
    const { locale } = await params;
    // The namespace is chosen per page, so neither it nor the keys under it
    // can be checked against the message tree statically. `ProductPage` casts
    // for the same reason; parity is enforced instead by the repo's i18n
    // gates, which compare the en and vi key trees.
    const t = (await getTranslations({
      locale: locale as 'en' | 'vi',
      namespace: namespace as never,
    })) as unknown as (key: string) => string;

    return getMarketingMetadata(
      {
        ...config,
        description: t('description'),
        title: t('title'),
      },
      locale
    );
  };
}
