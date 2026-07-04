import type {
  CmsEditorCollectionView,
  ExternalProjectAdapterKind,
  ExternalProjectCollection,
  ExternalProjectSummaryCollection,
} from '@tuturuuu/types';

type CmsEditorBlueprintView = CmsEditorCollectionView & {
  collectionSlugs: string[];
};

export type CmsEditorBlueprint = {
  contentViews: CmsEditorBlueprintView[];
  landingSlugs: string[];
};

const CMS_EDITOR_BLUEPRINTS: Partial<
  Record<ExternalProjectAdapterKind, CmsEditorBlueprint>
> = {
  exocorpse: {
    contentViews: [
      {
        collectionSlugs: ['about', 'about-content', 'about-faqs'],
        createCollection: {
          collectionType: 'about',
          description:
            'Landing profile, biography, FAQ, social links, and DNI content.',
          emptyHint:
            'Import Exocorpse content or create the first landing section.',
          entryTitle: 'Landing settings',
          slug: 'about',
          title: 'Landing page',
        },
        description:
          'Landing profile, biography, FAQ, social links, and DNI content.',
        id: 'landing',
        label: 'Landing page',
        navigationLabel: 'Landing page',
      },
      {
        collectionSlugs: [
          'stories',
          'worlds',
          'characters',
          'factions',
          'locations',
          'timelines',
          'events',
          'relationship-types',
          'outfit-types',
          'event-types',
          'character-outfits',
          'character-gallery',
          'character-relationships',
          'character-factions',
          'character-locations',
          'character-worlds',
          'location-gallery',
          'event-participants',
          'event-factions',
        ],
        description:
          'Story universes, worlds, characters, factions, locations, timelines, and lore links.',
        id: 'wiki',
        label: 'Wiki',
        navigationLabel: 'Wiki',
      },
      {
        collectionSlugs: [
          'portfolio-art',
          'portfolio-writing',
          'portfolio-games',
        ],
        description: 'Portfolio artwork, writing, and playable projects.',
        id: 'portfolio',
        label: 'Portfolio',
        navigationLabel: 'Portfolio',
      },
      {
        collectionSlugs: ['blog-posts'],
        description: 'Published and draft blog posts.',
        id: 'writing',
        label: 'Writing',
        navigationLabel: 'Writing',
      },
      {
        collectionSlugs: [
          'commission-services',
          'commission-addons',
          'commission-styles',
          'commission-pictures',
          'commission-service-addons',
          'commission-blacklist',
        ],
        description:
          'Commission services, pricing add-ons, style examples, and public blacklist records.',
        id: 'commissions',
        label: 'Commissions',
        navigationLabel: 'Commissions',
      },
      {
        collectionSlugs: [
          'heaven-space-passages',
          'heaven-space-assets',
          'heaven-space-scenes',
          'heaven-space-scene-choices',
        ],
        description: 'Heaven Space passages, scenes, choices, and assets.',
        id: 'heaven-space',
        label: 'Heaven Space',
        navigationLabel: 'Heaven Space',
      },
      {
        collectionSlugs: [
          'tags',
          'entity-tags',
          'moodboards',
          'media-assets',
          'cofi-samples',
        ],
        description:
          'Tags, moodboards, media library records, and COFI samples.',
        id: 'reference',
        label: 'Reference',
        navigationLabel: 'Reference',
      },
    ],
    landingSlugs: ['about', 'about-content', 'about-faqs'],
  },
  kendra: {
    contentViews: [
      {
        collectionSlugs: ['profile', 'contact'],
        createCollection: {
          collectionType: 'profile',
          description: 'Public profile, hero, biography, and booking copy.',
          emptyHint: 'Import Kendra content or create a profile section first.',
          entryTitle: 'Profile',
          slug: 'profile',
          title: 'Profile',
        },
        description: 'Public profile, hero copy, biography, and booking text.',
        id: 'landing',
        label: 'Landing page',
        navigationLabel: 'Landing page',
      },
      {
        collectionSlugs: ['voice-reels', 'credits', 'studio'],
        description: 'Voice reels, credits, studio details, and availability.',
        id: 'work',
        label: 'Work and reels',
        navigationLabel: 'Work',
      },
    ],
    landingSlugs: ['profile', 'contact'],
  },
  theguyser: {
    contentViews: [
      {
        collectionSlugs: [
          'site-config',
          'navigation',
          'panel-content',
          'quick-launch',
          'contact-social',
        ],
        createCollection: {
          collectionType: 'panel-content',
          description:
            'Landing panels, profile copy, launch cards, and contact links.',
          emptyHint:
            'Import TheGuyser content or create the first landing panel.',
          entryTitle: 'Landing panel',
          slug: 'panel-content',
          title: 'Landing content',
        },
        description:
          'Site config, navigation tiles, panels, quick launch cards, and contact links.',
        id: 'landing',
        label: 'Landing page',
        navigationLabel: 'Landing page',
      },
      {
        collectionSlugs: ['experience', 'awards', 'showreel'],
        description: 'Portfolio projects, focus areas, awards, and showreel.',
        id: 'portfolio',
        label: 'Portfolio',
        navigationLabel: 'Portfolio',
      },
    ],
    landingSlugs: [
      'site-config',
      'navigation',
      'panel-content',
      'quick-launch',
      'contact-social',
    ],
  },
  yashie: {
    contentViews: [
      {
        collectionSlugs: ['profile', 'social-links'],
        createCollection: {
          collectionType: 'profile',
          description:
            'Public profile, tagline, quote, values, and social links.',
          emptyHint:
            'Import Yashie content or create the profile section first.',
          entryTitle: 'Profile',
          slug: 'profile',
          title: 'Profile',
        },
        description: 'Profile, tagline, quote, values, and social links.',
        id: 'landing',
        label: 'Landing page',
        navigationLabel: 'Landing page',
      },
      {
        collectionSlugs: ['writing-worlds', 'blog-posts'],
        description: 'Writing worlds, essays, excerpts, and blog posts.',
        id: 'writing',
        label: 'Writing',
        navigationLabel: 'Writing',
      },
      {
        collectionSlugs: ['gallery', 'shop-products'],
        description: 'Gallery pieces and shop catalog entries.',
        id: 'shop-gallery',
        label: 'Shop and gallery',
        navigationLabel: 'Shop and gallery',
      },
    ],
    landingSlugs: ['profile', 'social-links'],
  },
  richfield: {
    contentViews: [
      {
        collectionSlugs: ['brands'],
        createCollection: {
          collectionType: 'brands',
          description:
            'Partner brands, portfolio categories, launch years, and story copy.',
          emptyHint: 'Import Richfield content or create the first brand.',
          entryTitle: 'Brand',
          slug: 'brands',
          title: 'Brands',
        },
        description:
          'Partner brands, portfolio categories, launch years, and story copy.',
        id: 'brands',
        label: 'Brands',
        navigationLabel: 'Brands',
      },
      {
        collectionSlugs: ['leadership'],
        description: 'Leadership profiles, biographies, photos, and quotes.',
        id: 'leadership',
        label: 'Leadership',
        navigationLabel: 'Leadership',
      },
      {
        collectionSlugs: ['milestones'],
        description: 'Company timeline milestones and brand partnership history.',
        id: 'timeline',
        label: 'Timeline',
        navigationLabel: 'Timeline',
      },
      {
        collectionSlugs: [
          'contact-page',
          'contact-channels',
          'contact-submissions',
        ],
        createCollection: {
          collectionType: 'contact-page',
          description:
            'Public contact page copy, channels, and private visitor messages.',
          emptyHint: 'Import Richfield content or create contact details first.',
          entryTitle: 'Contact page',
          slug: 'contact-page',
          title: 'Contact',
        },
        description:
          'Contact page copy, public channels, and private visitor messages.',
        id: 'contacts',
        label: 'Contacts',
        navigationLabel: 'Contacts',
      },
      {
        collectionSlugs: ['jobs'],
        createCollection: {
          collectionType: 'jobs',
          description: 'Open roles, listing details, deadlines, and links.',
          emptyHint: 'Create the first vacancy when Richfield is hiring.',
          entryTitle: 'Job',
          slug: 'jobs',
          title: 'Jobs',
        },
        description: 'Open roles, listing details, deadlines, and links.',
        id: 'careers',
        label: 'Careers',
        navigationLabel: 'Careers',
      },
      {
        collectionSlugs: ['image-library'],
        createCollection: {
          collectionType: 'image-library',
          description:
            'Reusable site images grouped by page and exact placement.',
          emptyHint: 'Upload the first Gallery image.',
          entryTitle: 'Image',
          slug: 'image-library',
          title: 'Gallery',
        },
        description: 'Reusable site images grouped by page and placement.',
        id: 'gallery',
        label: 'Gallery',
        navigationLabel: 'Gallery',
      },
    ],
    landingSlugs: ['brands', 'contact-page', 'contact-channels', 'jobs', 'image-library'],
  },
  yoola: {
    contentViews: [
      {
        collectionSlugs: ['singleton-sections'],
        createCollection: {
          collectionType: 'singleton-sections',
          description: 'Homepage, gallery, and writing section copy.',
          emptyHint:
            'Import Yoola content or create the first landing section.',
          entryTitle: 'Home hero',
          slug: 'singleton-sections',
          title: 'Landing sections',
        },
        description: 'Homepage, gallery, and writing section copy.',
        id: 'landing',
        label: 'Landing page',
        navigationLabel: 'Landing page',
      },
      {
        collectionSlugs: ['artworks'],
        description: 'Artwork archive records and gallery cards.',
        id: 'artworks',
        label: 'Artworks',
        navigationLabel: 'Artworks',
      },
      {
        collectionSlugs: ['lore-capsules'],
        description: 'Writing capsules, lore fragments, and release notes.',
        id: 'writing',
        label: 'Writing',
        navigationLabel: 'Writing',
      },
    ],
    landingSlugs: ['singleton-sections'],
  },
};

export function getCmsEditorBlueprint(
  adapter: ExternalProjectAdapterKind | null | undefined
) {
  return adapter ? CMS_EDITOR_BLUEPRINTS[adapter] : undefined;
}

export function getCmsEditorBlueprintViews(
  adapter: ExternalProjectAdapterKind | null | undefined
) {
  return getCmsEditorBlueprint(adapter)?.contentViews ?? [];
}

export function getCmsLandingCollectionSlugs(
  adapter: ExternalProjectAdapterKind | null | undefined
) {
  return getCmsEditorBlueprint(adapter)?.landingSlugs ?? [];
}

export function isCmsLandingCollection(
  adapter: ExternalProjectAdapterKind | null | undefined,
  collection: ExternalProjectCollection | ExternalProjectSummaryCollection
) {
  const landingSlugs = getCmsLandingCollectionSlugs(adapter);

  return landingSlugs.some(
    (slug) => slug.toLowerCase() === collection.slug.toLowerCase()
  );
}
