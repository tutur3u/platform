import type { SurfaceAccent } from '@/components/landing/shared/surface-card';

export interface Partner {
  name: string;
  description: string;
  category: string;
  accent: SurfaceAccent;
  logo: string;
  website: string;
  highlights: string[];
  featured?: boolean;
}

/**
 * The partner roster.
 *
 * Split out of the page so the grid stays presentation and the roster stays
 * data — adding a partner should not mean editing markup.
 */
export const partners: Partner[] = [
  {
    name: 'RMIT Neo Culture Tech Club',
    description:
      'A student community at RMIT University Vietnam dedicated to exploring and advancing technology, fostering innovation, and building a culture of tech excellence among students.',
    category: 'Student community',
    accent: 'purple',
    logo: '/media/partners/rmitnct.jpg',
    website: 'https://rmitnct.club',
    highlights: [
      'Student-led technology initiatives',
      'Innovation workshops and events',
      'Tech community building',
    ],
    featured: true,
  },
  {
    name: 'SPARK Hub',
    description:
      "RMIT University Vietnam's Strategic Innovation Challenge hub, empowering student startups with resources, mentorship, and support for turning ideas into ventures.",
    category: 'Innovation and entrepreneurship',
    accent: 'orange',
    logo: '/media/partners/sparkhub.jpg',
    website:
      'https://www.rmit.edu.vn/about-us/who-we-are/our-commitments/vietnam-country-commitment/strategic-innovation-challenge/spark-hub',
    highlights: [
      'Startup incubation support',
      'Entrepreneurship mentorship',
      'Innovation resources',
    ],
    featured: true,
  },
  {
    name: 'Google for Startups',
    description:
      'Brings the best of Google to the startup ecosystem, providing resources, connections, and support to help founders build and scale through its programmes.',
    category: 'Tech accelerator',
    accent: 'red',
    logo: '/media/partners/google-for-startups.jpg',
    website: 'https://startup.google.com',
    highlights: [
      'Startup acceleration programmes',
      'Google Cloud credits and resources',
      'Global founder network',
    ],
    featured: true,
  },
  {
    name: 'RMIT Business Analytics Champion',
    description:
      'One of the pioneering academic competitions in data analytics at RMIT, where students apply data-driven thinking to real business problems.',
    category: 'Analytics competition',
    accent: 'blue',
    logo: '/media/partners/rbac.jpg',
    website: 'https://rbac.vn',
    highlights: [
      'Data-driven problem solving',
      'Real-world business cases',
      'Industry professional connections',
    ],
  },
  {
    name: 'EXOCORPSE',
    description:
      "A secret corporation that cleanses humanity's sins by committing them, carrying out missions from heists to assassinations. Its agents split into the physically dominant Pulse and the intellectually cunning Neuro.",
    category: 'Creative fiction',
    accent: 'green',
    logo: '/media/partners/exocorpse.png',
    website: 'https://exocorpse.net',
    highlights: [
      'Immersive storytelling',
      'Dual-branch narrative',
      'Creative world-building',
    ],
  },
  {
    name: 'AllMind',
    description:
      'A mental health platform inspired by therapeutic tabletop role-playing games, creating a safe space for early prevention and intervention.',
    category: 'Mental health and wellness',
    accent: 'cyan',
    logo: '/media/partners/allmind.jpg',
    website: 'https://allmind.info',
    highlights: [
      'Therapeutic TTRPG approach',
      'Safe intervention space',
      'Community-driven wellness',
    ],
  },
  {
    name: 'SOKI',
    description:
      'A beverage start-up making seaweed-based drinks enriched with fucoidan, a natural compound found in brown seaweed, combining health, creativity and sustainability.',
    category: 'Health and beverage',
    accent: 'pink',
    logo: '/media/partners/soki.jpg',
    website: 'https://www.facebook.com/SOKInuocrongbientieuhoa',
    highlights: [
      'Seaweed-based wellness drinks',
      'Natural fucoidan benefits',
      'Sustainable beverage innovation',
    ],
  },
  {
    name: 'Upskii',
    description:
      'An AI assistant platform built for educators, helping them streamline teaching tasks, personalise learning, and improve the student experience.',
    category: 'EdTech and AI',
    accent: 'yellow',
    logo: '/media/partners/upskii.png',
    website: 'https://www.upskii.com',
    highlights: [
      'AI-powered teaching assistant',
      'Personalised learning experiences',
      'Streamlined educator workflows',
    ],
  },
];

export const featuredPartners = partners.filter((partner) => partner.featured);
export const otherPartners = partners.filter((partner) => !partner.featured);
