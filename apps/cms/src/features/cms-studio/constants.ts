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
  'richfield',
];

export const DEFAULT_EXTERNAL_PROJECT_COLLECTIONS = {
  exocorpse: ['portfolio-art', 'writing', 'games'],
  kendra: ['profile', 'voice-reels', 'credits', 'studio', 'contact'],
  richfield: [
    'brands',
    'leadership',
    'milestones',
    'contact-page',
    'contact-channels',
    'contact-submissions',
    'jobs',
    'image-library',
  ],
  junly: [
    'research-projects',
    'game-projects',
    'artworks',
    'feed-posts',
    'music-tracks',
    'singleton-sections',
  ],
  theguyser: [
    'site-config',
    'navigation',
    'quick-launch',
    'panel-content',
    'awards',
    'experience',
    'contact-social',
    'showreel',
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
  richfield: 'Richfield',
  shu: 'Shu',
  theguyser: 'TheGuyser',
  yashie: 'Yashie',
  shiraoki: 'Shiraoki',
  yoola: 'Yoola',
} satisfies Record<ExternalProjectAdapterKind, string>;
