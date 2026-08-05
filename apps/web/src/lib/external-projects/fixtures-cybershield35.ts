import type { ExternalProjectAdapterFixture } from './fixtures';

export const cybershield35ExternalProjectFixture = {
  adapter: 'cybershield35',
  collections: [
    {
      collectionType: 'article-media',
      description:
        'Private draft media and durable published assets for CyberShield35 articles.',
      entries: [],
      slug: 'article-media',
      sourceId: 'cybershield35:collection:article-media',
      title: 'Article media',
    },
  ],
  profileData: {
    deliveryPreset: 'article-media',
    mediaAuthority: 'tuturuuu-cms',
  },
  schema: {
    collections: [
      {
        assetTypes: ['image'],
        blockTypes: [],
        collection_type: 'article-media',
        description:
          'Images uploaded by CyberShield35 for reviewed and published articles.',
        metadataFields: [
          { key: 'cs35ArticleId', label: 'CS35 article ID', type: 'string' },
        ],
        profileFields: [
          { key: 'caption', label: 'Caption', type: 'string' },
          { key: 'altText', label: 'Alternative text', type: 'string' },
        ],
        slug: 'article-media',
        title: 'Article media',
      },
    ],
  },
  sourceReference: 'CyberShield35 article media contract',
} satisfies ExternalProjectAdapterFixture;
