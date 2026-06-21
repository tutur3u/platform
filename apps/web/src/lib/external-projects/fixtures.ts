import type {
  ExternalProjectAdapterKind,
  ExternalProjectSyncSchema,
} from '@tuturuuu/types';

type FixtureAsset = {
  altText?: string;
  assetType: string;
  sourceId: string;
  sourceUrl?: string;
  storagePath?: string;
};

type FixtureBlock = {
  blockType: string;
  content: Record<string, unknown>;
  sourceId: string;
  title?: string;
};

type FixtureEntry = {
  assets?: FixtureAsset[];
  blocks: FixtureBlock[];
  metadata?: Record<string, unknown>;
  profileData?: Record<string, unknown>;
  slug: string;
  sourceId: string;
  status?: 'draft' | 'published' | 'scheduled' | 'archived';
  subtitle?: string;
  summary?: string;
  title: string;
};

type FixtureCollection = {
  collectionType: string;
  description?: string;
  entries: FixtureEntry[];
  slug: string;
  sourceId: string;
  title: string;
};

export type ExternalProjectAdapterFixture = {
  adapter: ExternalProjectAdapterKind;
  collections: FixtureCollection[];
  profileData: Record<string, unknown>;
  schema?: ExternalProjectSyncSchema;
  sourceReference: string;
};

const yashieSchema = {
  collections: [
    {
      assetTypes: [],
      blockTypes: ['markdown'],
      collection_type: 'profile',
      description: 'Creator profile, biography, and landing-page copy.',
      metadataFields: [
        {
          key: 'seoTitle',
          label: 'SEO title',
          type: 'string',
        },
        {
          key: 'seoDescription',
          label: 'SEO description',
          type: 'markdown',
        },
      ],
      profileFields: [
        {
          key: 'displayName',
          label: 'Display name',
          required: true,
          type: 'string',
        },
        {
          key: 'tagline',
          label: 'Tagline',
          type: 'string',
        },
        {
          key: 'location',
          label: 'Location',
          type: 'string',
        },
        {
          key: 'commissionStatus',
          label: 'Commission status',
          options: ['open', 'waitlist', 'closed'],
          type: 'string',
        },
        {
          key: 'featuredGallerySlugs',
          label: 'Featured gallery slugs',
          type: 'string-array',
        },
      ],
      slug: 'profile',
      title: 'Profile',
    },
    {
      assetTypes: ['image'],
      blockTypes: ['markdown'],
      collection_type: 'blog-posts',
      description: 'Yashie blog posts and studio notes.',
      metadataFields: [
        {
          key: 'seoTitle',
          label: 'SEO title',
          type: 'string',
        },
        {
          key: 'seoDescription',
          label: 'SEO description',
          type: 'markdown',
        },
      ],
      profileFields: [
        {
          key: 'author',
          label: 'Author',
          type: 'string',
        },
        {
          key: 'publishedOn',
          label: 'Published on',
          type: 'date',
        },
        {
          key: 'tags',
          label: 'Tags',
          type: 'string-array',
        },
        {
          key: 'featured',
          label: 'Featured',
          type: 'boolean',
        },
      ],
      slug: 'blog-posts',
      title: 'Blog Posts',
    },
    {
      assetTypes: ['image'],
      blockTypes: ['markdown'],
      collection_type: 'gallery',
      description: 'Portfolio artwork, tattoos, flash sheets, and commissions.',
      metadataFields: [
        {
          key: 'credit',
          label: 'Credit',
          type: 'string',
        },
      ],
      profileFields: [
        {
          key: 'medium',
          label: 'Medium',
          options: ['digital', 'tattoo', 'flash', 'commission'],
          type: 'string',
        },
        {
          key: 'style',
          label: 'Style',
          type: 'string-array',
        },
        {
          key: 'completedOn',
          label: 'Completed on',
          type: 'date',
        },
        {
          key: 'featured',
          label: 'Featured',
          type: 'boolean',
        },
      ],
      slug: 'gallery',
      title: 'Gallery',
    },
    {
      assetTypes: ['image'],
      blockTypes: ['markdown'],
      collection_type: 'shop-products',
      description: 'Catalog-only shop products for prints, flash, and merch.',
      metadataFields: [
        {
          key: 'sku',
          label: 'SKU',
          type: 'string',
        },
      ],
      profileFields: [
        {
          key: 'price',
          label: 'Price',
          type: 'number',
        },
        {
          key: 'currency',
          label: 'Currency',
          type: 'string',
        },
        {
          key: 'available',
          label: 'Available',
          type: 'boolean',
        },
        {
          key: 'variants',
          label: 'Variants',
          type: 'string-array',
        },
      ],
      slug: 'shop-products',
      title: 'Shop Products',
    },
    {
      assetTypes: ['image'],
      blockTypes: ['markdown'],
      collection_type: 'writing-worlds',
      description: 'Fiction worlds, lore pages, and long-form writing.',
      profileFields: [
        {
          key: 'genre',
          label: 'Genre',
          type: 'string',
        },
        {
          key: 'status',
          label: 'Status',
          options: ['drafting', 'revising', 'published'],
          type: 'string',
        },
        {
          key: 'contentWarnings',
          label: 'Content warnings',
          type: 'string-array',
        },
      ],
      slug: 'writing-worlds',
      title: 'Writing Worlds',
    },
    {
      assetTypes: [],
      blockTypes: [],
      collection_type: 'social-links',
      description: 'Public social, shop, and contact links.',
      metadataFields: [
        {
          key: 'rel',
          label: 'Link rel',
          type: 'string',
        },
      ],
      profileFields: [
        {
          key: 'url',
          label: 'URL',
          required: true,
          type: 'string',
        },
        {
          key: 'platform',
          label: 'Platform',
          type: 'string',
        },
        {
          key: 'isPrimary',
          label: 'Primary link',
          type: 'boolean',
        },
      ],
      slug: 'social-links',
      title: 'Social Links',
    },
  ],
} satisfies ExternalProjectSyncSchema;

const kendraSchema = {
  collections: [
    {
      assetTypes: ['image'],
      blockTypes: ['markdown'],
      collection_type: 'profile',
      description: 'Voice actor profile, bio, brand copy, and hero imagery.',
      profileFields: [
        {
          key: 'email',
          label: 'Email',
          required: true,
          type: 'string',
        },
        {
          key: 'location',
          label: 'Location',
          type: 'string',
        },
        {
          key: 'tagline',
          label: 'Tagline',
          type: 'string',
        },
        {
          key: 'gvaaUrl',
          label: 'GVAA rate guide URL',
          type: 'string',
        },
        {
          key: 'resumeUrl',
          label: 'Resume URL',
          type: 'string',
        },
      ],
      slug: 'profile',
      title: 'Profile',
    },
    {
      assetTypes: ['audio'],
      blockTypes: ['markdown'],
      collection_type: 'voice-reels',
      description:
        'Voice-over demo reels optimized for public listening and casting review.',
      profileFields: [
        {
          key: 'category',
          label: 'Category',
          type: 'string',
        },
        {
          key: 'duration',
          label: 'Duration',
          type: 'string',
        },
        {
          key: 'style',
          label: 'Voice style',
          type: 'string',
        },
        {
          key: 'featured',
          label: 'Featured reel',
          type: 'boolean',
        },
        {
          key: 'downloadLabel',
          label: 'Download label',
          type: 'string',
        },
      ],
      slug: 'voice-reels',
      title: 'Voice Reels',
    },
    {
      assetTypes: [],
      collection_type: 'credits',
      description: 'Commercial, character, and training credits.',
      profileFields: [
        {
          key: 'group',
          label: 'Credit group',
          type: 'string',
        },
        {
          key: 'role',
          label: 'Role',
          type: 'string',
        },
        {
          key: 'visual',
          label: 'Visual metadata',
          type: 'json',
        },
      ],
      slug: 'credits',
      title: 'Credits',
    },
    {
      assetTypes: [],
      collection_type: 'studio',
      description: 'Home studio specs and live-direction availability.',
      profileFields: [
        {
          key: 'kind',
          label: 'Studio item kind',
          options: ['spec', 'availability'],
          type: 'string',
        },
        {
          key: 'label',
          label: 'Label',
          type: 'string',
        },
        {
          key: 'value',
          label: 'Value',
          type: 'string',
        },
      ],
      slug: 'studio',
      title: 'Studio',
    },
    {
      assetTypes: [],
      blockTypes: ['markdown'],
      collection_type: 'contact',
      description: 'Booking copy, email, and rate guide links.',
      profileFields: [
        {
          key: 'email',
          label: 'Email',
          type: 'string',
        },
        {
          key: 'gvaaUrl',
          label: 'GVAA URL',
          type: 'string',
        },
      ],
      slug: 'contact',
      title: 'Contact',
    },
  ],
  profileFields: [
    {
      key: 'brand',
      label: 'Brand',
      type: 'string',
    },
    {
      key: 'deliveryPreset',
      label: 'Delivery preset',
      type: 'string',
    },
  ],
} satisfies ExternalProjectSyncSchema;

const richfieldSchema = {
  collections: [
    {
      assetTypes: ['image'],
      collection_type: 'brands',
      description:
        'Partner brands in the Richfield portfolio with country, category, and story copy.',
      profileFields: [
        { key: 'country', label: 'Country', type: 'string' },
        { key: 'year', label: 'Year', type: 'number' },
        {
          key: 'category',
          label: 'Category',
          options: ['Food', 'Beverages', 'Non-Food'],
          type: 'string',
        },
        { key: 'accent', label: 'Accent', type: 'string' },
        { key: 'feature', label: 'Feature', type: 'boolean' },
        { key: 'featureCaption', label: 'Feature caption', type: 'string' },
      ],
      slug: 'brands',
      title: 'Brands',
    },
    {
      assetTypes: ['image'],
      blockTypes: ['markdown', 'quote'],
      collection_type: 'leadership',
      description: 'Richfield leadership profiles, bios, and quotes.',
      profileFields: [{ key: 'role', label: 'Role', type: 'string' }],
      slug: 'leadership',
      title: 'Leadership',
    },
    {
      collection_type: 'milestones',
      description: 'Company timeline milestones from founding to the present day.',
      profileFields: [
        { key: 'year', label: 'Year', type: 'number' },
        { key: 'country', label: 'Country', type: 'string' },
        { key: 'brand', label: 'Brand', type: 'string' },
        { key: 'aboutOnly', label: 'About only', type: 'boolean' },
      ],
      slug: 'milestones',
      title: 'Milestones',
    },
    {
      assetTypes: ['image'],
      blockTypes: ['markdown'],
      collection_type: 'contact-page',
      description: 'Public contact page hero copy, map details, and imagery.',
      profileFields: [
        { key: 'headline', label: 'Headline', type: 'string' },
        { key: 'intro', label: 'Intro', type: 'markdown' },
        { key: 'mapQuery', label: 'Map query', type: 'string' },
        {
          key: 'backgroundImageSlug',
          label: 'Background image slug',
          type: 'string',
        },
      ],
      slug: 'contact-page',
      title: 'Contact Page',
    },
    {
      collection_type: 'contact-channels',
      description: 'Public contact methods shown on the contact page.',
      profileFields: [
        {
          key: 'kind',
          label: 'Kind',
          options: ['office', 'phone', 'email', 'facebook'],
          type: 'string',
        },
        { key: 'href', label: 'Link', type: 'string' },
        { key: 'secondary', label: 'Secondary text', type: 'string' },
        { key: 'cta', label: 'Call to action', type: 'string' },
        { key: 'external', label: 'External', type: 'boolean' },
        { key: 'sortOrder', label: 'Sort order', type: 'number' },
      ],
      slug: 'contact-channels',
      title: 'Contact Channels',
    },
    {
      blockTypes: ['markdown'],
      collection_type: 'contact-submissions',
      description:
        'Private inbound contact form messages saved for Richfield admins.',
      profileFields: [
        { key: 'name', label: 'Name', type: 'string' },
        { key: 'company', label: 'Company', type: 'string' },
        { key: 'country', label: 'Country', type: 'string' },
        { key: 'email', label: 'Email', type: 'string' },
        { key: 'inquiryType', label: 'Inquiry type', type: 'string' },
        { key: 'receivedAt', label: 'Received at', type: 'datetime' },
        {
          key: 'submissionStatus',
          label: 'Submission status',
          options: ['new', 'reviewed', 'archived'],
          type: 'string',
        },
        {
          key: 'emailNotificationStatus',
          label: 'Email notification status',
          options: ['pending', 'sent', 'failed'],
          type: 'string',
        },
      ],
      slug: 'contact-submissions',
      title: 'Contact Inbox',
    },
    {
      collection_type: 'jobs',
      description: 'Careers vacancies shown on the Richfield careers page.',
      profileFields: [
        { key: 'positions', label: 'Positions', type: 'number' },
        { key: 'location', label: 'Location', type: 'string' },
        { key: 'deadline', label: 'Deadline', type: 'string' },
        { key: 'href', label: 'External link', type: 'string' },
        { key: 'sortOrder', label: 'Sort order', type: 'number' },
      ],
      slug: 'jobs',
      title: 'Jobs',
    },
    {
      assetTypes: ['image'],
      collection_type: 'image-library',
      description: 'Reusable Richfield images grouped by page and placement.',
      profileFields: [
        {
          key: 'pageSection',
          label: 'Page section',
          options: [
            'home',
            'about',
            'brands',
            'careers',
            'contact',
            'distribution',
            'logistics',
            'footer-navigation',
            'shared',
          ],
          type: 'string',
        },
        { key: 'placement', label: 'Placement', type: 'string' },
        { key: 'brand', label: 'Brand', type: 'string' },
        {
          key: 'category',
          label: 'Category',
          options: ['Food', 'Beverages', 'Non-Food'],
          type: 'string',
        },
        { key: 'productName', label: 'Product name', type: 'string' },
        { key: 'feature', label: 'Featured tile', type: 'boolean' },
        {
          key: 'shelfWeight',
          label: 'Shelf banner size',
          options: ['hero', 'wide', 'feature'],
          type: 'string',
        },
        { key: 'usageTags', label: 'Usage tags', type: 'string-array' },
        { key: 'objectPosition', label: 'Object position', type: 'string' },
        { key: 'ratio', label: 'Ratio', type: 'number' },
        { key: 'credit', label: 'Credit', type: 'string' },
        { key: 'sortOrder', label: 'Sort order', type: 'number' },
      ],
      slug: 'image-library',
      title: 'Gallery',
    },
  ],
} satisfies ExternalProjectSyncSchema;

export const externalProjectAdapterFixtures: Record<
  ExternalProjectAdapterKind,
  ExternalProjectAdapterFixture
> = {
  junly: {
    adapter: 'junly',
    sourceReference: '../junly/components/launcher/content-data.ts',
    profileData: {
      brand: 'Junly',
      deliveryPreset: 'launcher',
    },
    collections: [
      {
        collectionType: 'research-projects',
        description: 'Research-led portfolio studies imported from Junly.',
        slug: 'research-projects',
        sourceId: 'junly:collection:research-projects',
        title: 'Research Projects',
        entries: [
          {
            sourceId: 'junly:research:cozy-games-market-force',
            slug: 'cozy-games-market-force',
            title: 'The Rise of Cozy Games as a Market Force',
            subtitle: 'Market Research',
            summary:
              'A market research project on cozy games as a durable commercial category.',
            status: 'published',
            profileData: {
              year: 'July 2025',
              stack: ['Market Research', 'Quantitative', 'PowerPoint', 'Word'],
            },
            blocks: [
              {
                sourceId: 'junly:research:cozy-games-market-force:about',
                blockType: 'markdown',
                title: 'About',
                content: {
                  markdown:
                    'This study examines how cozy games moved from niche comfort play into a recognizable market force using Spry Fox as the anchor case study.',
                },
              },
            ],
            assets: [
              {
                sourceId: 'junly:research:cozy-games-market-force:thumbnail',
                assetType: 'image',
                storagePath:
                  'external-projects/junly/research/cozy-games-market-force/thumbnail.png',
                altText: 'Thumbnail for Cozy Games market research',
              },
            ],
          },
          {
            sourceId: 'junly:research:ace-attorney-research',
            slug: 'ace-attorney-research',
            title: 'Player Engagement in Narrative Games',
            subtitle: 'Ace Attorney Case Study',
            summary:
              'A mixed-methods project exploring narrative retention with Ace Attorney as the core case study.',
            status: 'published',
            profileData: {
              year: 'July 2024 - September 2024',
              stack: ['Ethnography', 'Surveys', 'Interviews', 'Mixed Methods'],
            },
            blocks: [
              {
                sourceId: 'junly:research:ace-attorney-research:about',
                blockType: 'markdown',
                title: 'About',
                content: {
                  markdown:
                    'Research into how narrative design keeps players engaged over time through pacing, payoff, and fan participation.',
                },
              },
            ],
          },
        ],
      },
      {
        collectionType: 'game-projects',
        description: 'Playable and design-led game work from Junly.',
        slug: 'game-projects',
        sourceId: 'junly:collection:game-projects',
        title: 'Game Projects',
        entries: [
          {
            sourceId: 'junly:game:magi-girl',
            slug: 'magi-girl',
            title: 'MAGI-GIRL.EXE',
            subtitle: 'Vertical Slice, Turn-Based RPG',
            summary:
              'A story-driven RPG about an aspiring romance novelist pulled into magical-girl chaos.',
            status: 'published',
            profileData: {
              genres: [
                'Vertical Slice',
                'Turn-based',
                'Experimental',
                'Solo Dev',
              ],
              state: 'Completed',
            },
            blocks: [
              {
                sourceId: 'junly:game:magi-girl:description',
                blockType: 'markdown',
                title: 'Description',
                content: {
                  markdown:
                    'A punchy story-driven RPG with an intentionally weird turn halfway through the fantasy premise.',
                },
              },
            ],
          },
        ],
      },
      {
        collectionType: 'artworks',
        slug: 'artworks',
        sourceId: 'junly:collection:artworks',
        title: 'Artworks',
        entries: [
          {
            sourceId: 'junly:art:sea-glass-memory',
            slug: 'sea-glass-memory',
            title: 'Sea Glass Memory',
            summary: 'Illustration imported from Junly artworks.',
            status: 'published',
            blocks: [],
            assets: [
              {
                sourceId: 'junly:art:sea-glass-memory:image',
                assetType: 'image',
                storagePath:
                  'external-projects/junly/artworks/sea-glass-memory.png',
                altText: 'Sea Glass Memory artwork',
              },
            ],
          },
        ],
      },
      {
        collectionType: 'feed-posts',
        slug: 'feed-posts',
        sourceId: 'junly:collection:feed-posts',
        title: 'Feed Posts',
        entries: [
          {
            sourceId: 'junly:post:1',
            slug: 'prototype-feeling',
            title: 'Prototype Feeling',
            summary: 'Short social update imported from Junly.',
            status: 'published',
            blocks: [
              {
                sourceId: 'junly:post:1:body',
                blockType: 'markdown',
                content: {
                  markdown:
                    'Prototypes keep teaching me more than polished docs do. I like finding the feeling of a game early.',
                },
              },
            ],
          },
        ],
      },
      {
        collectionType: 'music-tracks',
        slug: 'music-tracks',
        sourceId: 'junly:collection:music-tracks',
        title: 'Music Tracks',
        entries: [
          {
            sourceId: 'junly:music:signal-loop',
            slug: 'signal-loop',
            title: 'Signal Loop',
            summary:
              'Imported soundtrack stub for the external project studio.',
            status: 'draft',
            profileData: {
              artist: 'Junly',
              length: '2:41',
              mood: 'Dream pop',
            },
            blocks: [],
          },
        ],
      },
      {
        collectionType: 'singleton-sections',
        slug: 'singleton-sections',
        sourceId: 'junly:collection:singleton-sections',
        title: 'Singleton Sections',
        entries: [
          {
            sourceId: 'junly:singleton:home-intro',
            slug: 'home-intro',
            title: 'Home Intro',
            summary: 'Shared singleton content for the Junly home surface.',
            status: 'published',
            blocks: [
              {
                sourceId: 'junly:singleton:home-intro:body',
                blockType: 'markdown',
                content: {
                  markdown:
                    'Junly blends research, game work, art, and social fragments into one launcher-style portfolio.',
                },
              },
            ],
          },
        ],
      },
    ],
  },
  yoola: {
    adapter: 'yoola',
    sourceReference: '../yoola/lib/archive-data.ts',
    profileData: {
      brand: 'Yoola',
      deliveryPreset: 'archive',
    },
    collections: [
      {
        collectionType: 'artworks',
        description: 'Archive artworks imported from Yoola.',
        slug: 'artworks',
        sourceId: 'yoola:collection:artworks',
        title: 'Artworks',
        entries: [
          {
            sourceId: 'yoola:art:starter-signal',
            slug: 'starter-signal',
            title: 'STARTER SIGNAL',
            summary:
              'Launch-frame portrait with podium lighting and high-contrast violet bleed.',
            status: 'published',
            profileData: {
              category: 'SPEED',
              height: 2124,
              label: 'ARC-01',
              note: 'Launch-frame portrait with podium lighting and high-contrast violet bleed.',
              orientation: 'portrait',
              rarity: 'SSR',
              width: 1440,
              year: '2026',
            },
            blocks: [],
            assets: [
              {
                sourceId: 'yoola:art:starter-signal:image',
                assetType: 'image',
                storagePath: 'external-projects/yoola/artworks/1.png',
                altText: 'Starter Signal artwork',
              },
            ],
          },
          {
            sourceId: 'yoola:art:pitline-static',
            slug: 'pitline-static',
            title: 'PITLINE STATIC',
            summary:
              'Low-angle scene study built around pressure, steel, and idle momentum.',
            status: 'published',
            profileData: {
              category: 'GUTS',
              height: 680,
              label: 'ARC-02',
              note: 'Low-angle scene study built around pressure, steel, and idle momentum.',
              orientation: 'landscape',
              rarity: 'SR',
              width: 1024,
              year: '2025',
            },
            blocks: [],
            assets: [
              {
                sourceId: 'yoola:art:pitline-static:image',
                assetType: 'image',
                storagePath: 'external-projects/yoola/artworks/2.png',
                altText: 'Pitline Static artwork',
              },
            ],
          },
          {
            sourceId: 'yoola:art:horizon-break',
            slug: 'horizon-break',
            title: 'HORIZON BREAK',
            summary:
              'Wide environmental composition with broadcast-scale framing.',
            status: 'published',
            profileData: {
              category: 'POWER',
              height: 1440,
              label: 'ARC-03',
              note: 'Wide environmental composition with broadcast-scale framing.',
              orientation: 'landscape',
              rarity: 'SSR',
              width: 2400,
              year: '2025',
            },
            blocks: [],
            assets: [
              {
                sourceId: 'yoola:art:horizon-break:image',
                assetType: 'image',
                storagePath: 'external-projects/yoola/artworks/3.png',
                altText: 'Horizon Break artwork',
              },
            ],
          },
          {
            sourceId: 'yoola:art:trackside-idol',
            slug: 'trackside-idol',
            title: 'TRACKSIDE IDOL',
            summary:
              'Compact square study centered on gesture, charm, and sticker-like attitude.',
            status: 'published',
            profileData: {
              category: 'WISDOM',
              height: 578,
              label: 'ARC-04',
              note: 'Compact square study centered on gesture, charm, and sticker-like attitude.',
              orientation: 'square',
              rarity: 'R',
              width: 624,
              year: '2024',
            },
            blocks: [],
            assets: [
              {
                sourceId: 'yoola:art:trackside-idol:image',
                assetType: 'image',
                storagePath: 'external-projects/yoola/artworks/4.png',
                altText: 'Trackside Idol artwork',
              },
            ],
          },
          {
            sourceId: 'yoola:art:neon-silence',
            slug: 'neon-silence',
            title: 'NEON SILENCE',
            summary:
              'Symmetrical close-frame image with soft bloom and poster-grade contrast.',
            status: 'published',
            profileData: {
              category: 'STAMINA',
              height: 1440,
              label: 'ARC-05',
              note: 'Symmetrical close-frame image with soft bloom and poster-grade contrast.',
              orientation: 'square',
              rarity: 'SR',
              width: 1442,
              year: '2026',
            },
            blocks: [],
            assets: [
              {
                sourceId: 'yoola:art:neon-silence:image',
                assetType: 'image',
                storagePath: 'external-projects/yoola/artworks/5.png',
                altText: 'Neon Silence artwork',
              },
            ],
          },
          {
            sourceId: 'yoola:art:pulse-vector',
            slug: 'pulse-vector',
            title: 'PULSE VECTOR',
            summary:
              'Vertical acceleration piece with layered motion cues and hard edge lighting.',
            status: 'published',
            profileData: {
              category: 'SPEED',
              height: 1960,
              label: 'ARC-06',
              note: 'Vertical acceleration piece with layered motion cues and hard edge lighting.',
              orientation: 'portrait',
              rarity: 'SSR',
              width: 1440,
              year: '2025',
            },
            blocks: [],
            assets: [
              {
                sourceId: 'yoola:art:pulse-vector:image',
                assetType: 'image',
                storagePath: 'external-projects/yoola/artworks/6.png',
                altText: 'Pulse Vector artwork',
              },
            ],
          },
          {
            sourceId: 'yoola:art:crowd-transmission',
            slug: 'crowd-transmission',
            title: 'CROWD TRANSMISSION',
            summary:
              'Broadcast-style moment capture with heavy implied noise and audience energy.',
            status: 'published',
            profileData: {
              category: 'POWER',
              height: 618,
              label: 'ARC-07',
              note: 'Broadcast-style moment capture with heavy implied noise and audience energy.',
              orientation: 'landscape',
              rarity: 'SR',
              width: 866,
              year: '2024',
            },
            blocks: [],
            assets: [
              {
                sourceId: 'yoola:art:crowd-transmission:image',
                assetType: 'image',
                storagePath: 'external-projects/yoola/artworks/7.png',
                altText: 'Crowd Transmission artwork',
              },
            ],
          },
          {
            sourceId: 'yoola:art:violet-draft',
            slug: 'violet-draft',
            title: 'VIOLET DRAFT',
            summary:
              'Large-format spread with editorial negative space and directional flare.',
            status: 'published',
            profileData: {
              category: 'WISDOM',
              height: 1440,
              label: 'ARC-08',
              note: 'Large-format spread with editorial negative space and directional flare.',
              orientation: 'landscape',
              rarity: 'SSR',
              width: 2360,
              year: '2026',
            },
            blocks: [],
            assets: [
              {
                sourceId: 'yoola:art:violet-draft:image',
                assetType: 'image',
                storagePath: 'external-projects/yoola/artworks/8.png',
                altText: 'Violet Draft artwork',
              },
            ],
          },
          {
            sourceId: 'yoola:art:token-glare',
            slug: 'token-glare',
            title: 'TOKEN GLARE',
            summary:
              'Punchy square cut built like a badge or stamped collectible.',
            status: 'published',
            profileData: {
              category: 'GUTS',
              height: 600,
              label: 'ARC-09',
              note: 'Punchy square cut built like a badge or stamped collectible.',
              orientation: 'square',
              rarity: 'R',
              width: 672,
              year: '2023',
            },
            blocks: [],
            assets: [
              {
                sourceId: 'yoola:art:token-glare:image',
                assetType: 'image',
                storagePath: 'external-projects/yoola/artworks/9.png',
                altText: 'Token Glare artwork',
              },
            ],
          },
          {
            sourceId: 'yoola:art:final-overtake',
            slug: 'final-overtake',
            title: 'FINAL OVERTAKE',
            summary:
              'Tall key visual with posterized silhouette work and ceremonial framing.',
            status: 'published',
            profileData: {
              category: 'STAMINA',
              height: 2360,
              label: 'ARC-10',
              note: 'Tall key visual with posterized silhouette work and ceremonial framing.',
              orientation: 'portrait',
              rarity: 'SSR',
              width: 1440,
              year: '2026',
            },
            blocks: [],
            assets: [
              {
                sourceId: 'yoola:art:final-overtake:image',
                assetType: 'image',
                storagePath: 'external-projects/yoola/artworks/10.png',
                altText: 'Final Overtake artwork',
              },
            ],
          },
        ],
      },
      {
        collectionType: 'lore-capsules',
        slug: 'lore-capsules',
        sourceId: 'yoola:collection:lore-capsules',
        title: 'Lore Capsules',
        entries: [
          {
            sourceId: 'yoola:lore:violet-horizon',
            slug: 'violet-horizon',
            title: 'The Violet Horizon',
            summary:
              'A post-race scene file about silence, pressure, and the calm after a win.',
            status: 'published',
            profileData: {
              artworkSlug: 'final-overtake',
              channel: 'Main Transmission',
              date: '2026.04.12',
              status: 'IN TRANSIT',
              tags: ['MAIN_STORY', 'AFTERMATH', 'ANGST'],
              teaser:
                'A post-race scene file about silence, pressure, and the strange calm that follows a win nobody understands.',
            },
            blocks: [
              {
                sourceId: 'yoola:lore:violet-horizon:excerpt',
                blockType: 'markdown',
                title: 'Excerpt',
                content: {
                  markdown:
                    'The stadium emptied in waves, but the violet glow on the far rail refused to die.',
                },
              },
            ],
          },
          {
            sourceId: 'yoola:lore:midnight-strategy',
            slug: 'midnight-strategy',
            title: 'Midnight Strategy',
            summary:
              'A planner-room fragment built around tactics, fatigue, and the cost of optimizing everything.',
            status: 'draft',
            profileData: {
              artworkSlug: 'horizon-break',
              channel: 'Draft Capsule',
              date: '2026.05.02',
              status: 'STAGING',
              tags: ['TACTICS', 'CHARACTER', 'EXTRA'],
              teaser:
                'A planner-room fragment built around tactics, fatigue, and the cost of optimizing everything.',
            },
            blocks: [
              {
                sourceId: 'yoola:lore:midnight-strategy:excerpt',
                blockType: 'markdown',
                title: 'Excerpt',
                content: {
                  markdown:
                    'Sheets of telemetry crawled across the desk while the city outside dimmed to static. Winning stopped looking like instinct and started looking like architecture.',
                },
              },
            ],
          },
          {
            sourceId: 'yoola:lore:crowd-noise-protocol',
            slug: 'crowd-noise-protocol',
            title: 'Crowd Noise Protocol',
            summary:
              'An event-night placeholder file focused on public image, performance, and the split between persona and self.',
            status: 'draft',
            profileData: {
              artworkSlug: 'crowd-transmission',
              channel: 'Event Archive',
              date: '2026.05.19',
              status: 'LOCKED',
              tags: ['EVENT', 'PUBLIC_MASK', 'SLICE_OF_LIFE'],
              teaser:
                'An event-night placeholder file focused on public image, performance, and the split between persona and self.',
            },
            blocks: [
              {
                sourceId: 'yoola:lore:crowd-noise-protocol:excerpt',
                blockType: 'markdown',
                title: 'Excerpt',
                content: {
                  markdown:
                    'By the time the announcement hit, the cheering had already turned into weather. She smiled at nobody in particular and adjusted her gloves like the room had gone quiet.',
                },
              },
            ],
          },
        ],
      },
      {
        collectionType: 'singleton-sections',
        slug: 'singleton-sections',
        sourceId: 'yoola:collection:singleton-sections',
        title: 'Singleton Sections',
        entries: [
          {
            sourceId: 'yoola:singleton:home-hero',
            slug: 'home-hero',
            title: 'Home Hero',
            summary: 'Shared home hero content for the Yoola archive delivery.',
            status: 'published',
            blocks: [
              {
                sourceId: 'yoola:singleton:home-hero:body',
                blockType: 'markdown',
                content: {
                  markdown:
                    'Pure expression, no rules, and archive-grade image presentation.',
                },
              },
            ],
          },
          {
            sourceId: 'yoola:singleton:gallery-intro',
            slug: 'gallery-intro',
            title: 'Gallery Intro',
            summary: 'Intro copy for the gallery archive surface.',
            status: 'published',
            blocks: [
              {
                sourceId: 'yoola:singleton:gallery-intro:body',
                blockType: 'markdown',
                content: {
                  markdown:
                    'Ten local works, indexed as collectible case files with fullscreen viewing decks and filterable visual categories.',
                },
              },
            ],
          },
          {
            sourceId: 'yoola:singleton:writing-intro',
            slug: 'writing-intro',
            title: 'Writing Intro',
            summary: 'Intro copy for the lore queue surface.',
            status: 'published',
            blocks: [
              {
                sourceId: 'yoola:singleton:writing-intro:body',
                blockType: 'markdown',
                content: {
                  markdown:
                    'The dossier queue is live, narrative files are staged, and each capsule has a routeable detail page ready for finished prose.',
                },
              },
            ],
          },
        ],
      },
    ],
  },
  theguyser: {
    adapter: 'theguyser',
    sourceReference: '../theguyser/components/portfolio/data.ts',
    profileData: {
      brand: 'Theguyser',
      deliveryPreset: 'dashboard',
      profile: {
        email: 'bchua753@gmail.com',
        name: 'Bao Chua',
        role: 'Game Designer',
      },
    },
    collections: [
      {
        collectionType: 'panel-content',
        slug: 'panel-content',
        sourceId: 'theguyser:collection:panel-content',
        title: 'Panel Content',
        entries: [
          {
            sourceId: 'theguyser:panel:profile',
            slug: 'profile',
            title: 'Profile',
            summary: 'Primary portfolio profile panel.',
            status: 'published',
            blocks: [
              {
                sourceId: 'theguyser:panel:profile:intro',
                blockType: 'markdown',
                content: {
                  markdown:
                    "I am a recent graduate from RMIT Vietnam's Game Design program.",
                },
              },
            ],
          },
        ],
      },
      {
        collectionType: 'awards',
        slug: 'awards',
        sourceId: 'theguyser:collection:awards',
        title: 'Awards & Focus',
        entries: [
          {
            sourceId: 'theguyser:focus:games-archives',
            slug: 'games-archives',
            title: 'Games Archives',
            summary:
              'Console history in Vietnam, retro collections, and preservation research.',
            status: 'published',
            blocks: [],
          },
        ],
      },
      {
        collectionType: 'gallery',
        slug: 'gallery',
        sourceId: 'theguyser:collection:gallery',
        title: 'Showcase',
        entries: [
          {
            sourceId: 'theguyser:showcase:necrolist',
            slug: 'necrolist',
            title: 'Necrolist',
            summary: 'Narrative-led work anchored by Necrolist.',
            status: 'published',
            blocks: [],
            assets: [
              {
                sourceId: 'theguyser:showcase:necrolist:image',
                assetType: 'image',
                sourceUrl:
                  'https://baochua.carrd.co/assets/images/container03.jpg?v=4f0e4032',
                altText: 'Necrolist showcase image',
              },
            ],
          },
        ],
      },
      {
        collectionType: 'experience',
        slug: 'experience',
        sourceId: 'theguyser:collection:experience',
        title: 'Experience',
        entries: [
          {
            sourceId: 'theguyser:game:spaceship-fps',
            slug: 'spaceship-fps',
            title: 'Spaceship FPS',
            summary: 'UE5 FPS level with platforming, shooting, and enemy AI.',
            status: 'published',
            blocks: [],
          },
          {
            sourceId: 'theguyser:research:console-culture',
            slug: 'console-culture',
            title: 'Unpacking Console Culture in Vietnam',
            summary:
              'Games archive research cataloging retro console history in Vietnam.',
            status: 'published',
            blocks: [],
          },
        ],
      },
      {
        collectionType: 'contact-social',
        slug: 'contact-social',
        sourceId: 'theguyser:collection:contact-social',
        title: 'Contact & Social',
        entries: [
          {
            sourceId: 'theguyser:contact:primary',
            slug: 'primary',
            title: 'Primary Contact',
            summary: 'Outbound links and contact methods.',
            status: 'published',
            blocks: [
              {
                sourceId: 'theguyser:contact:primary:links',
                blockType: 'links',
                content: {
                  links: [
                    {
                      href: 'mailto:bchua753@gmail.com',
                      label: 'Email',
                    },
                    {
                      href: 'https://www.linkedin.com/in/bao-chua/',
                      label: 'LinkedIn',
                    },
                    {
                      href: 'https://theguyser.itch.io/',
                      label: 'Itch.io',
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
  },
  exocorpse: {
    adapter: 'exocorpse',
    sourceReference: '../exocorpse/src/components/apps/Portfolio.tsx',
    profileData: {
      brand: 'EXOCORPSE',
      deliveryPreset: 'desktop-os',
    },
    collections: [
      {
        collectionType: 'portfolio-art',
        slug: 'portfolio-art',
        sourceId: 'exocorpse:collection:portfolio-art',
        title: 'Portfolio Art',
        entries: [
          {
            sourceId: 'exocorpse:art:heaven-space-key-art',
            slug: 'heaven-space-key-art',
            title: 'Heaven Space Key Art',
            summary: 'Representative visual work from the EXOCORPSE portfolio.',
            status: 'published',
            blocks: [
              {
                sourceId: 'exocorpse:art:heaven-space-key-art:caption',
                blockType: 'markdown',
                content: {
                  markdown:
                    'Portfolio art imported into the normalized EXOCORPSE collection.',
                },
              },
            ],
          },
        ],
      },
      {
        collectionType: 'writing',
        slug: 'writing',
        sourceId: 'exocorpse:collection:writing',
        title: 'Writing',
        entries: [
          {
            sourceId: 'exocorpse:writing:field-notes',
            slug: 'field-notes',
            title: 'Field Notes',
            summary:
              'Recent writings, updates, and field notes from EXOCORPSE.',
            status: 'published',
            blocks: [
              {
                sourceId: 'exocorpse:writing:field-notes:body',
                blockType: 'markdown',
                content: {
                  markdown:
                    'A compact writing entry mapped from the existing blog-like writing surface.',
                },
              },
            ],
          },
        ],
      },
      {
        collectionType: 'games',
        slug: 'games',
        sourceId: 'exocorpse:collection:games',
        title: 'Games',
        entries: [
          {
            sourceId: 'exocorpse:game:heaven-space',
            slug: 'heaven-space',
            title: 'Heaven Space',
            summary: 'Interactive fiction and visual game work from EXOCORPSE.',
            status: 'published',
            blocks: [
              {
                sourceId: 'exocorpse:game:heaven-space:overview',
                blockType: 'markdown',
                content: {
                  markdown:
                    'Game entry synchronized from the EXOCORPSE desktop-style experience.',
                },
              },
            ],
          },
        ],
      },
    ],
  },
  kendra: {
    adapter: 'kendra',
    sourceReference: '../kendra/lib/kendra-external-project-manifest.ts',
    profileData: {
      brand: 'Kendra Braun',
      deliveryPreset: 'voice-over',
    },
    schema: kendraSchema,
    collections: [
      {
        collectionType: 'profile',
        description: 'Voice actor profile, bio, brand copy, and hero imagery.',
        slug: 'profile',
        sourceId: 'kendra:collection:profile',
        title: 'Profile',
        entries: [
          {
            sourceId: 'kendra:profile:profile',
            slug: 'profile',
            title: 'Kendra Braun',
            subtitle: 'Remote & International Voice Actor',
            summary: 'Primary Kendra Braun voice actor profile.',
            status: 'published',
            profileData: {
              email: 'kendrabraun0@gmail.com',
              location: 'Alberta, Canada',
              tagline: 'Remote & International Voice Actor',
            },
            blocks: [
              {
                sourceId: 'kendra:profile:profile:bio',
                blockType: 'markdown',
                title: 'Bio',
                content: {
                  markdown:
                    'Voice actor profile and biography synchronized from the Kendra static site.',
                },
              },
            ],
            assets: [
              {
                sourceId: 'kendra:profile:profile:hero',
                assetType: 'image',
                storagePath: 'external-projects/kendra/profile/hero.png',
                altText:
                  'Illustrated portrait of Kendra Braun holding a microphone',
              },
            ],
          },
        ],
      },
      {
        collectionType: 'voice-reels',
        description:
          'Voice-over demo reels optimized for public listening and casting review.',
        slug: 'voice-reels',
        sourceId: 'kendra:collection:voice-reels',
        title: 'Voice Reels',
        entries: [
          {
            sourceId: 'kendra:voice-reel:interactive',
            slug: 'interactive',
            title: 'Kendra Braun - Interactive',
            subtitle: 'Audio reel',
            summary:
              'A character-forward sample reel for interactive and narrative voice work.',
            status: 'published',
            profileData: {
              category: 'Interactive',
              downloadLabel: 'Download MP3',
              duration: '1:20',
              featured: true,
              style: 'Character / Game',
            },
            blocks: [
              {
                sourceId: 'kendra:voice-reel:interactive:notes',
                blockType: 'markdown',
                title: 'Script notes',
                content: {
                  markdown:
                    'Character-forward read with conversational narration and game dialogue.',
                },
              },
            ],
            assets: [
              {
                sourceId: 'kendra:voice-reel:interactive:audio',
                assetType: 'audio',
                storagePath:
                  'external-projects/kendra/voice-reels/interactive/kendra-braun-interactive.mp3',
                altText: 'Kendra Braun interactive audio reel',
              },
            ],
          },
        ],
      },
      {
        collectionType: 'credits',
        description: 'Commercial, character, and training credits.',
        slug: 'credits',
        sourceId: 'kendra:collection:credits',
        title: 'Credits',
        entries: [
          {
            sourceId: 'kendra:credit:nippon-tv',
            slug: 'nippon-tv',
            title: 'Nippon TV',
            subtitle: 'Canadian K',
            summary: 'Nippon TV - Canadian K',
            status: 'published',
            profileData: {
              group: 'Commercial & Corporate Experience',
              role: 'Canadian K',
              visual: {
                tone: 'broadcast',
              },
            },
            blocks: [],
          },
        ],
      },
      {
        collectionType: 'studio',
        description: 'Home studio specs and live-direction availability.',
        slug: 'studio',
        sourceId: 'kendra:collection:studio',
        title: 'Studio',
        entries: [
          {
            sourceId: 'kendra:studio:source-connect',
            slug: 'source-connect',
            title: 'Source-Connect',
            summary: 'Source-Connect Standard equipped home studio.',
            status: 'published',
            profileData: {
              kind: 'spec',
              label: 'Source-Connect',
              value: 'Source-Connect Standard',
            },
            blocks: [],
          },
        ],
      },
      {
        collectionType: 'contact',
        description: 'Booking copy, email, and rate guide links.',
        slug: 'contact',
        sourceId: 'kendra:collection:contact',
        title: 'Contact',
        entries: [
          {
            sourceId: 'kendra:contact:booking',
            slug: 'booking',
            title: 'Booking',
            summary:
              'For booking, availability, and rates, contact Kendra directly.',
            status: 'published',
            profileData: {
              email: 'kendrabraun0@gmail.com',
            },
            blocks: [
              {
                sourceId: 'kendra:contact:booking:intro',
                blockType: 'markdown',
                title: 'Booking intro',
                content: {
                  markdown:
                    'For booking, availability, and rates, contact Kendra directly.',
                },
              },
            ],
          },
        ],
      },
    ],
  },
  richfield: {
    adapter: 'richfield',
    sourceReference:
      '../Richfield/lib/richfield-external-project-manifest.ts',
    profileData: {
      brand: 'Richfield',
      deliveryPreset: 'richfield-main',
    },
    schema: richfieldSchema,
    collections: [
      {
        collectionType: 'brands',
        description:
          'Partner brands in the Richfield portfolio with country, category, and story copy.',
        slug: 'brands',
        sourceId: 'richfield:collection:brands',
        title: 'Brands',
        entries: [
          {
            assets: [
              {
                altText: 'Mars Wrigley',
                assetType: 'image',
                sourceId: 'richfield:brands:mars-wrigley:image',
                sourceUrl: '/photos/brands/mars-wrigley.webp',
              },
            ],
            blocks: [],
            profileData: {
              category: 'Food',
              country: 'Vietnam',
              feature: true,
              year: 1994,
            },
            slug: 'mars-wrigley',
            sourceId: 'richfield:brands:mars-wrigley',
            status: 'published',
            subtitle: 'Food',
            summary:
              'The partnership that began Richfield distribution in Vietnam.',
            title: 'Mars Wrigley',
          },
        ],
      },
      {
        collectionType: 'leadership',
        description: 'Richfield leadership profiles, bios, and quotes.',
        slug: 'leadership',
        sourceId: 'richfield:collection:leadership',
        title: 'Leadership',
        entries: [
          {
            assets: [
              {
                altText: 'Bill Chua',
                assetType: 'image',
                sourceId: 'richfield:leadership:bill-chua:image',
                sourceUrl: '/photos/people/bill-chua.webp',
              },
            ],
            blocks: [
              {
                blockType: 'markdown',
                content: {
                  markdown:
                    'Bill Chua leads Richfield through long-term partnerships and care for people.',
                },
                sourceId: 'richfield:leadership:bill-chua:bio',
                title: 'Bio',
              },
            ],
            profileData: {
              role: 'Chief Executive Officer',
            },
            slug: 'bill-chua',
            sourceId: 'richfield:leadership:bill-chua',
            status: 'published',
            subtitle: 'Chief Executive Officer',
            summary: 'Second-generation Richfield leader.',
            title: 'Bill Chua',
          },
        ],
      },
      {
        collectionType: 'milestones',
        description: 'Company timeline milestones from founding to the present day.',
        slug: 'milestones',
        sourceId: 'richfield:collection:milestones',
        title: 'Milestones',
        entries: [
          {
            blocks: [],
            profileData: {
              aboutOnly: false,
              brand: 'Mars Wrigley',
              country: 'Vietnam',
              year: 1994,
            },
            slug: '1994-mars-wrigley',
            sourceId: 'richfield:milestones:1994-mars-wrigley',
            status: 'published',
            subtitle: 'Vietnam',
            summary:
              'Mars Wrigley Vietnam selected Richfield as its distributor.',
            title: 'Mars Wrigley',
          },
        ],
      },
      {
        collectionType: 'contact-page',
        description: 'Public contact page hero copy, map details, and imagery.',
        slug: 'contact-page',
        sourceId: 'richfield:collection:contact-page',
        title: 'Contact Page',
        entries: [
          {
            assets: [
              {
                altText: 'Richfield team contact background',
                assetType: 'image',
                sourceId: 'richfield:contact-page:main:image',
                sourceUrl: '/photos/contact-richfield.webp',
              },
            ],
            blocks: [
              {
                blockType: 'markdown',
                content: {
                  markdown:
                    'Brand owner exploring Vietnam, partner considering a joint venture, or journalist on deadline: we will write back within two business days.',
                },
                sourceId: 'richfield:contact-page:main:intro',
                title: 'Intro',
              },
            ],
            profileData: {
              backgroundImageSlug: 'contact-richfield',
              headline: 'Tell us about your brand.',
              intro:
                'Brand owner exploring Vietnam, partner considering a joint venture, or journalist on deadline: we will write back within two business days.',
              mapQuery: 'Richfield Group Ho Chi Minh City',
            },
            slug: 'main',
            sourceId: 'richfield:contact-page:main',
            status: 'published',
            subtitle: 'Contact',
            summary: 'Public contact page content.',
            title: 'Contact Page',
          },
        ],
      },
      {
        collectionType: 'contact-channels',
        description: 'Public contact methods shown on the contact page.',
        slug: 'contact-channels',
        sourceId: 'richfield:collection:contact-channels',
        title: 'Contact Channels',
        entries: [
          {
            blocks: [],
            profileData: {
              cta: 'Write us',
              external: false,
              href: 'mailto:cskh@richfieldvn.com.vn',
              kind: 'email',
              secondary: 'Partnerships team',
              sortOrder: 30,
            },
            slug: 'email',
            sourceId: 'richfield:contact-channels:email',
            status: 'published',
            subtitle: 'Partnerships team',
            summary: 'cskh@richfieldvn.com.vn',
            title: 'Email',
          },
        ],
      },
      {
        collectionType: 'contact-submissions',
        description:
          'Private inbound contact form messages saved for Richfield admins.',
        entries: [],
        slug: 'contact-submissions',
        sourceId: 'richfield:collection:contact-submissions',
        title: 'Contact Inbox',
      },
      {
        collectionType: 'jobs',
        description: 'Careers vacancies shown on the Richfield careers page.',
        entries: [],
        slug: 'jobs',
        sourceId: 'richfield:collection:jobs',
        title: 'Jobs',
      },
      {
        collectionType: 'image-library',
        description: 'Reusable Richfield images grouped by page and placement.',
        slug: 'image-library',
        sourceId: 'richfield:collection:image-library',
        title: 'Gallery',
        entries: [
          {
            assets: [
              {
                altText: 'Richfield careers team gallery image',
                assetType: 'image',
                sourceId: 'richfield:image-library:careers-life-01:image',
                sourceUrl: '/photos/careers-life/01.webp',
              },
            ],
            blocks: [],
            profileData: {
              objectPosition: 'center',
              pageSection: 'careers',
              placement: 'gallery-image',
              ratio: 1.333,
              sortOrder: 10,
              usageTags: ['gallery'],
            },
            slug: 'careers-life-01',
            sourceId: 'richfield:image-library:careers-life-01',
            status: 'published',
            subtitle: 'careers',
            summary: 'Life at Richfield gallery image.',
            title: 'Careers Life 01',
          },
        ],
      },
    ],
  },
  shiraoki: {
    adapter: 'shiraoki',
    sourceReference: '../shiraoki/lib/cms.ts',
    profileData: {
      brand: 'Shiraoki',
      brandName: 'Shiraoki',
      deliveryPreset: 'shopify-storefront',
    },
    collections: [
      {
        collectionType: 'site-config',
        slug: 'site-config',
        sourceId: 'shiraoki:collection:site-config',
        title: 'Site Config',
        entries: [
          {
            sourceId: 'shiraoki:site-config:main',
            slug: 'main',
            title: 'Main',
            summary: 'Primary storefront identity and portability settings.',
            status: 'published',
            profileData: {
              brandName: 'Shiraoki',
            },
            blocks: [
              {
                sourceId: 'shiraoki:site-config:main:body',
                blockType: 'markdown',
                content: {
                  markdown:
                    'A minimal Shopify storefront coordinated through Tuturuuu CMS and Auth.',
                },
              },
            ],
          },
        ],
      },
      {
        collectionType: 'launch-gate',
        slug: 'launch-gate',
        sourceId: 'shiraoki:collection:launch-gate',
        title: 'Launch Gate',
        entries: [
          {
            sourceId: 'shiraoki:launch-gate:main',
            slug: 'main',
            title: 'Launch Gate',
            summary: 'Enter password for early access.',
            status: 'published',
            profileData: {
              enabled: false,
              message: 'Enter password for early access.',
            },
            blocks: [],
          },
        ],
      },
      {
        collectionType: 'navigation',
        slug: 'navigation',
        sourceId: 'shiraoki:collection:navigation',
        title: 'Navigation',
        entries: [
          {
            sourceId: 'shiraoki:navigation:shop',
            slug: 'shop',
            title: 'Shop',
            status: 'published',
            profileData: {
              href: '/',
            },
            blocks: [],
          },
          {
            sourceId: 'shiraoki:navigation:catalog',
            slug: 'catalog',
            title: 'Catalog',
            status: 'published',
            profileData: {
              href: '/collections/all',
            },
            blocks: [],
          },
          {
            sourceId: 'shiraoki:navigation:account',
            slug: 'account',
            title: 'Account',
            status: 'published',
            profileData: {
              href: '/account',
            },
            blocks: [],
          },
        ],
      },
      {
        collectionType: 'editorial-sections',
        slug: 'editorial-sections',
        sourceId: 'shiraoki:collection:editorial-sections',
        title: 'Editorial Sections',
        entries: [
          {
            sourceId: 'shiraoki:editorial:minimal-commerce',
            slug: 'minimal-commerce',
            title: 'Frictionless by subtraction',
            summary:
              'A single-domain shop surface: catalog, account, admin, and cart stay close together until Shopify checkout takes payment.',
            status: 'published',
            profileData: {
              eyebrow: 'System',
            },
            blocks: [],
          },
          {
            sourceId: 'shiraoki:editorial:barebones-complete',
            slug: 'barebones-complete',
            title: 'Barebones without feeling unfinished',
            summary:
              'Compact text, clear actions, real product media, and no decorative filler.',
            status: 'published',
            profileData: {
              eyebrow: 'Direction',
            },
            blocks: [],
          },
        ],
      },
      {
        collectionType: 'shopify-settings',
        slug: 'shopify-settings',
        sourceId: 'shiraoki:collection:shopify-settings',
        title: 'Shopify Settings',
        entries: [
          {
            sourceId: 'shiraoki:shopify-settings:main',
            slug: 'main',
            title: 'Shopify Settings',
            summary: 'Storefront integration settings for the active shop.',
            status: 'published',
            profileData: {
              featuredCollectionHandle: 'all',
            },
            blocks: [],
          },
        ],
      },
    ],
  },
  shu: {
    adapter: 'shu',
    sourceReference: '../shu/lib/shu-external-project-manifest.ts',
    profileData: {
      brand: 'Shu',
      deliveryPreset: 'game-portfolio',
    },
    collections: [
      {
        collectionType: 'games',
        slug: 'games',
        sourceId: 'shu:collection:games',
        title: 'Games',
        entries: [
          {
            sourceId: 'shu:game:portfolio-showcase',
            slug: 'portfolio-showcase',
            title: 'Portfolio Showcase',
            summary: 'Playable and interactive work synchronized from Shu.',
            status: 'published',
            blocks: [
              {
                sourceId: 'shu:game:portfolio-showcase:overview',
                blockType: 'markdown',
                content: {
                  markdown:
                    'A representative Shu game portfolio entry for external project setup.',
                },
              },
            ],
          },
        ],
      },
    ],
  },
  yashie: {
    adapter: 'yashie',
    sourceReference: '../yashie/lib/yashie-external-project-manifest.ts',
    profileData: {
      brand: 'InkedByYashie',
      deliveryPreset: 'portfolio-shop',
    },
    schema: yashieSchema,
    collections: [
      {
        collectionType: 'profile',
        description: 'Creator profile, biography, and landing-page copy.',
        slug: 'profile',
        sourceId: 'yashie:collection:profile',
        title: 'Profile',
        entries: [
          {
            sourceId: 'yashie:profile:main',
            slug: 'main',
            title: 'InkedByYashie',
            subtitle: 'Artist profile',
            summary:
              'Tattoo-inspired illustration, flash sheets, and shop-ready artwork.',
            status: 'published',
            profileData: {
              commissionStatus: 'waitlist',
              displayName: 'InkedByYashie',
              featuredGallerySlugs: ['featured-work'],
              location: 'Online studio',
              tagline: 'Soft lines, sharp feelings, story-led ink.',
            },
            blocks: [
              {
                sourceId: 'yashie:profile:main:bio',
                blockType: 'markdown',
                title: 'Bio',
                content: {
                  markdown:
                    'Yashie builds expressive character pieces, tattoo flash, and small-batch shop drops with a romantic darkline feel.',
                },
              },
            ],
          },
        ],
      },
      {
        collectionType: 'blog-posts',
        description: 'Yashie blog posts and studio notes.',
        slug: 'blog-posts',
        sourceId: 'yashie:collection:blog-posts',
        title: 'Blog Posts',
        entries: [
          {
            sourceId: 'yashie:blog:first-shop-drop',
            slug: 'first-shop-drop',
            title: 'Planning the First Shop Drop',
            summary:
              'A studio note about preparing prints, flash, and commission slots.',
            status: 'draft',
            profileData: {
              author: 'Yashie',
              featured: true,
              publishedOn: '2026-05-01',
              tags: ['shop', 'process'],
            },
            blocks: [
              {
                sourceId: 'yashie:blog:first-shop-drop:body',
                blockType: 'markdown',
                title: 'Body',
                content: {
                  markdown:
                    'The first drop needs to feel small, specific, and easy to browse: prints, flash claims, and a simple note about commission timing.',
                },
              },
            ],
          },
        ],
      },
      {
        collectionType: 'gallery',
        description:
          'Portfolio artwork, tattoos, flash sheets, and commissions.',
        slug: 'gallery',
        sourceId: 'yashie:collection:gallery',
        title: 'Gallery',
        entries: [
          {
            sourceId: 'yashie:gallery:featured-work',
            slug: 'featured-work',
            title: 'Featured Work',
            summary: 'Representative gallery entry synchronized from Yashie.',
            status: 'published',
            profileData: {
              completedOn: '2026-04-18',
              featured: true,
              medium: 'digital',
              style: ['linework', 'romantic'],
            },
            blocks: [
              {
                sourceId: 'yashie:gallery:featured-work:overview',
                blockType: 'markdown',
                content: {
                  markdown:
                    'A representative Yashie gallery entry for external project setup.',
                },
              },
            ],
          },
        ],
      },
      {
        collectionType: 'shop-products',
        description: 'Catalog-only shop products for prints, flash, and merch.',
        slug: 'shop-products',
        sourceId: 'yashie:collection:shop-products',
        title: 'Shop Products',
        entries: [
          {
            sourceId: 'yashie:shop:moon-flash-print',
            slug: 'moon-flash-print',
            title: 'Moon Flash Print',
            summary: 'Catalog entry for a small print release.',
            status: 'draft',
            metadata: {
              sku: 'YSH-PRINT-001',
            },
            profileData: {
              available: true,
              currency: 'USD',
              price: 24,
              variants: ['A5', 'A4'],
            },
            blocks: [
              {
                sourceId: 'yashie:shop:moon-flash-print:description',
                blockType: 'markdown',
                title: 'Description',
                content: {
                  markdown:
                    'A moonlit flash-inspired print prepared as a CMS catalog item only; checkout integration is intentionally out of scope.',
                },
              },
            ],
          },
        ],
      },
      {
        collectionType: 'writing-worlds',
        description: 'Fiction worlds, lore pages, and long-form writing.',
        slug: 'writing-worlds',
        sourceId: 'yashie:collection:writing-worlds',
        title: 'Writing Worlds',
        entries: [
          {
            sourceId: 'yashie:world:velvet-orbit',
            slug: 'velvet-orbit',
            title: 'Velvet Orbit',
            summary: 'A world seed for long-form writing and character lore.',
            status: 'draft',
            profileData: {
              contentWarnings: ['melancholy'],
              genre: 'romantic fantasy',
              status: 'drafting',
            },
            blocks: [
              {
                sourceId: 'yashie:world:velvet-orbit:notes',
                blockType: 'markdown',
                title: 'Notes',
                content: {
                  markdown:
                    'A quiet orbital city where tattoo sigils act as memory keys.',
                },
              },
            ],
          },
        ],
      },
      {
        collectionType: 'social-links',
        description: 'Public social, shop, and contact links.',
        slug: 'social-links',
        sourceId: 'yashie:collection:social-links',
        title: 'Social Links',
        entries: [
          {
            sourceId: 'yashie:social:instagram',
            slug: 'instagram',
            title: 'Instagram',
            summary: 'Primary social profile.',
            status: 'published',
            metadata: {
              rel: 'me',
            },
            profileData: {
              isPrimary: true,
              platform: 'Instagram',
              url: 'https://instagram.com/inkedbyyashie',
            },
            blocks: [],
          },
        ],
      },
    ],
  },
};
