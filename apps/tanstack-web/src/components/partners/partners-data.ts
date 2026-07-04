export type PartnerColor =
  | 'blue'
  | 'cyan'
  | 'green'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red';

export type Partner = {
  category: string;
  color: PartnerColor;
  description: string;
  featured?: boolean;
  highlights: string[];
  logo: string;
  name: string;
  website: string;
};

export const partners: Partner[] = [
  {
    name: 'RMIT Neo Culture Tech Club',
    description:
      'A vibrant student community at RMIT University Vietnam dedicated to exploring and advancing technology, fostering innovation, and building a culture of tech excellence among students.',
    category: 'Student Community',
    color: 'purple',
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
      "RMIT University Vietnam's Strategic Innovation Challenge hub that empowers student startups and entrepreneurial ventures, providing resources, mentorship, and support for turning innovative ideas into reality.",
    category: 'Innovation & Entrepreneurship',
    color: 'orange',
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
      'Google for Startups brings the best of Google to the startup ecosystem, providing world-class resources, connections, and support to help founders build and scale their businesses through various programs and initiatives.',
    category: 'Tech Accelerator',
    color: 'red',
    logo: '/media/partners/google-for-startups.jpg',
    website: 'https://startup.google.com',
    highlights: [
      'Startup acceleration programs',
      'Google Cloud credits & resources',
      'Global founder network',
    ],
    featured: true,
  },
  {
    name: 'RMIT Business Analytics Champion',
    description:
      'One of the pioneering academic competitions in data analytics at RMIT, where students apply data-driven thinking to solve real-world business problems and connect with industry professionals.',
    category: 'Analytics Competition',
    color: 'blue',
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
      "A secret corporation that cleanses humanity's sins by committing them, carrying out missions from heists to assassinations. Its agents are divided into two branches: the physically dominant Pulse and the intellectually cunning Neuro.",
    category: 'Creative Fiction',
    color: 'green',
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
      'A mental health platform inspired by Therapeutic Tabletop Role-Playing Games (TTRPGs) that creates a safe and engaging space for early prevention and intervention activities, fostering holistic health balance and building a resilient generation.',
    category: 'Mental Health & Wellness',
    color: 'cyan',
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
      'A start-up beverage brand introducing healthy, refreshing seaweed-based drinks enriched with fucoidan - a natural compound found in brown seaweed known for its wellness benefits. Redefining daily beverages by combining health, creativity and sustainability.',
    category: 'Health & Beverage',
    color: 'pink',
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
      'A smart and optimized AI assistant platform for educators in the digital age. This advanced technology solution is tailored for education, enabling educators to streamline teaching tasks, personalize learning, and elevate the student experience.',
    category: 'EdTech & AI',
    color: 'blue',
    logo: '/media/partners/upskii.png',
    website: 'https://www.upskii.com',
    highlights: [
      'AI-powered teaching assistant',
      'Personalized learning experiences',
      'Streamlined educator workflows',
    ],
  },
];
