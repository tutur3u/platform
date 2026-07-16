import {
  createPageMetadata,
  generatePageMetadata,
  type PageMetadataConfig,
} from '@tuturuuu/utils/common/metadata';
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
