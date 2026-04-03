import type { ExternalProjectAdapterKind } from '@tuturuuu/types';

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
  sourceReference: string;
};

export const externalProjectAdapterFixtures: Record<
  ExternalProjectAdapterKind,
  ExternalProjectAdapterFixture
> = {
  junly: {
    adapter: 'junly',
    sourceReference:
      '/Users/vhpx/Documents/GitHub/junly/components/launcher/content-data.ts',
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
    sourceReference: '/Users/vhpx/Documents/GitHub/yoola/lib/archive-data.ts',
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
    sourceReference:
      '/Users/vhpx/Documents/GitHub/theguyser/components/portfolio/data.ts',
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
    sourceReference:
      '/Users/vhpx/Documents/GitHub/exocorpse/src/components/apps/Portfolio.tsx',
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
};
