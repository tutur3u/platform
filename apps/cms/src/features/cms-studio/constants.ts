import type { ExternalProjectAdapterKind } from '@tuturuuu/types';

export const EXTERNAL_PROJECT_ENABLED_SECRET = 'EXTERNAL_PROJECT_ENABLED';
export const EXTERNAL_PROJECT_CANONICAL_ID_SECRET =
  'EXTERNAL_PROJECT_CANONICAL_ID';

export const EXTERNAL_PROJECT_PREVIEW_QUERY_PARAM = 'preview';

export const EXTERNAL_PROJECT_ADAPTER_OPTIONS: ExternalProjectAdapterKind[] = [
  'junly',
  'yoola',
  'theguyser',
  'exocorpse',
  'shu',
  'yashie',
  'shiraoki',
  'kendra',
];

export const DEFAULT_EXTERNAL_PROJECT_COLLECTIONS = {
  exocorpse: ['portfolio-art', 'writing', 'games'],
  kendra: ['profile', 'voice-reels', 'credits', 'studio', 'contact'],
  junly: [
    'research-projects',
    'game-projects',
    'artworks',
    'feed-posts',
    'music-tracks',
    'singleton-sections',
  ],
  theguyser: [
    'panel-content',
    'awards',
    'gallery',
    'experience',
    'contact-social',
  ],
  shu: [
    'profile',
    'projects',
    'games',
    'contact',
    'town-stops',
    'asset-library',
  ],
  yashie: [
    'profile',
    'writing-worlds',
    'gallery',
    'blog-posts',
    'shop-products',
    'social-links',
  ],
  shiraoki: [
    'site-config',
    'launch-gate',
    'navigation',
    'editorial-sections',
    'shopify-settings',
  ],
  yoola: ['artworks', 'lore-capsules', 'singleton-sections'],
} satisfies Record<ExternalProjectAdapterKind, string[]>;

export const EXTERNAL_PROJECT_DISPLAY_NAMES = {
  exocorpse: 'Exocorpse',
  junly: 'Junly',
  kendra: 'Kendra',
  shu: 'Shu',
  theguyser: 'TheGuyser',
  yashie: 'Yashie',
  shiraoki: 'Shiraoki',
  yoola: 'Yoola',
} satisfies Record<ExternalProjectAdapterKind, string>;
