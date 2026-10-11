import {
  createPageMetadata,
  type PageMetadataConfig,
} from '@tuturuuu/utils/common/metadata';

export function createLettinPageMetadata(
  config: Omit<PageMetadataConfig, 'baseUrl' | 'siteName' | 'localePrefix'>
) {
  return createPageMetadata({
    ...config,
    baseUrl: 'https://lettin.tuturuuu.com',
    siteName: 'Tulletin',
    localePrefix: 'never',
  });
}
