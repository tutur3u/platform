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
            'Reusable site images grouped by page section and usage tags.',
          emptyHint: 'Upload the first reusable site image.',
          entryTitle: 'Image',
          slug: 'image-library',
          title: 'Images',
        },
        description: 'Reusable site images grouped by page section.',
        id: 'images',
        label: 'Images',
        navigationLabel: 'Images',
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
