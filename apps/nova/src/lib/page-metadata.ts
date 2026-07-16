import {
  generatePageMetadata,
  type PageMetadataConfig,
} from '@tuturuuu/utils/common/metadata';
import { siteConfig } from '@/constants/configs';

type NovaPageMetadataConfig = Omit<PageMetadataConfig, 'baseUrl' | 'locale'>;

interface NovaPageMetadataProps {
  params: Promise<{
    locale: string;
  }>;
}

export function createNovaPageMetadata(config: NovaPageMetadataConfig) {
  return ({ params }: NovaPageMetadataProps) =>
    generatePageMetadata({
      config: {
        ...config,
        baseUrl: siteConfig.url,
        image: config.image ?? siteConfig.ogImage,
        indexable: config.indexable ?? true,
        localePrefix: 'as-needed',
        siteName: config.siteName ?? siteConfig.name,
      },
      params,
    });
}
