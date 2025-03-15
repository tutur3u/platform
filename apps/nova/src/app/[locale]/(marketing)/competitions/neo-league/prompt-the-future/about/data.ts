export interface TeamMember {
  name: string;
  role: string;
  image: string;
  bio: string;
  links?: {
    twitter?: string;
    linkedin?: string;
    github?: string;
    website?: string;
    email?: string;
  };
  organization?: string;
}

export interface Sponsor {
  name: string;
  tier: 'platinum' | 'gold' | 'silver' | 'bronze';
  logo: string;
  website: string;
  description: string;
}

export interface Contributor {
  name: string;
  contribution: string;
  image?: string;
}

export const organizers: TeamMember[] = [
  {
    name: 'Jane Smith',
    role: 'Program Director',
    image: '/media/logos/transparent.png',
    bio: 'Jane leads the NEO League initiative with over 10 years of experience in AI education and prompt engineering competitions.',
    organization: 'RMIT SGS Neo Culture Tech',
    links: {
      twitter: 'https://twitter.com/janesmith',
      linkedin: 'https://linkedin.com/in/janesmith',
      email: 'jane@example.com',
    },
  },
  {
    name: 'Michael Chen',
    role: 'Technical Lead',
    image: '/media/logos/transparent.png',
    bio: 'Michael oversees all technical aspects of the competition and platform development, ensuring a seamless experience for all participants.',
    organization: 'RMIT SGS Neo Culture Tech',
    links: {
      github: 'https://github.com/michaelchen',
      linkedin: 'https://linkedin.com/in/michaelchen',
      website: 'https://michaelchen.dev',
    },
  },
  {
    name: 'Sarah Johnson',
    role: 'Education Director',
    image: '/media/logos/transparent.png',
    bio: 'Sarah designs the educational curriculum and learning resources for participants, specializing in prompt engineering techniques and best practices.',
    organization: 'Tuturuuu',
    links: {
      twitter: 'https://twitter.com/sarahjohnson',
      linkedin: 'https://linkedin.com/in/sarahjohnson',
      email: 'sarah@example.com',
    },
  },
  {
    name: 'David Kim',
    role: 'Community Manager',
    image: '/media/logos/transparent.png',
    bio: 'David builds and nurtures our community of prompt engineers and AI enthusiasts, creating an engaging environment for collaboration and growth.',
    organization: 'RMIT SGS Neo Culture Tech',
    links: {
      twitter: 'https://twitter.com/davidkim',
      linkedin: 'https://linkedin.com/in/davidkim',
      github: 'https://github.com/davidkim',
    },
  },
];

export const platformBuilders: TeamMember[] = [
  {
    name: 'Alex Rivera',
    role: 'Lead Developer',
    image: '/media/logos/transparent.png',
    bio: 'Alex architected and built the core platform infrastructure for the Neo League competition, focusing on scalability and performance.',
    organization: 'Tuturuuu',
    links: {
      github: 'https://github.com/alexrivera',
      linkedin: 'https://linkedin.com/in/alexrivera',
      website: 'https://alexrivera.dev',
    },
  },
  {
    name: 'Priya Patel',
    role: 'Frontend Engineer',
    image: '/media/logos/transparent.png',
    bio: 'Priya designed and implemented the user interface and experience, creating an intuitive and engaging platform for prompt engineering challenges.',
    organization: 'Tuturuuu',
    links: {
      github: 'https://github.com/priyapatel',
      twitter: 'https://twitter.com/priyapatel',
      linkedin: 'https://linkedin.com/in/priyapatel',
    },
  },
  {
    name: 'Marcus Wong',
    role: 'Backend Engineer',
    image: '/media/logos/transparent.png',
    bio: 'Marcus developed the API and database architecture for the platform, ensuring reliable performance during high-traffic competition periods.',
    organization: 'Tuturuuu',
    links: {
      github: 'https://github.com/marcuswong',
      linkedin: 'https://linkedin.com/in/marcuswong',
      email: 'marcus@example.com',
    },
  },
  {
    name: 'Elena Petrova',
    role: 'AI Systems Engineer',
    image: '/media/logos/transparent.png',
    bio: 'Elena integrated and optimized the AI evaluation systems for the competition, developing sophisticated metrics to assess prompt engineering skills.',
    organization: 'Tuturuuu',
    links: {
      github: 'https://github.com/elenapetrova',
      linkedin: 'https://linkedin.com/in/elenapetrova',
      twitter: 'https://twitter.com/elenapetrova',
    },
  },
];

export const sponsors: Sponsor[] = [
  {
    name: 'Tuturuuu',
    tier: 'platinum',
    logo: '/media/logos/transparent.png',
    website: 'https://tuturuuu.com',
    description:
      'Pioneer in AI and smart productivity tools, providing technical and platform support for the Neo League competition. Tuturuuu Nova is revolutionizing how we interact with AI through advanced prompt engineering.',
  },
  {
    name: 'RMIT SGS Neo Culture Tech',
    tier: 'platinum',
    logo: '/media/logos/transparent.png',
    website: 'https://rmit-sgs-neotech.org',
    description:
      'Host of the Neo League - Prompt the Future 2025 competition, dedicated to fostering innovation and technical excellence in AI and prompt engineering among students.',
  },
  {
    name: 'TechCorp',
    tier: 'gold',
    logo: '/media/logos/transparent.png',
    website: 'https://techcorp.example.com',
    description:
      'Leading AI research and development company supporting the next generation of prompt engineers through the Neo League initiative.',
  },
  {
    name: 'DataSystems',
    tier: 'gold',
    logo: '/media/logos/transparent.png',
    website: 'https://datasystems.example.com',
    description:
      'Cloud infrastructure provider offering computing resources for the competition, enabling participants to test and deploy sophisticated prompt engineering solutions.',
  },
  {
    name: 'AIVentures',
    tier: 'silver',
    logo: '/media/logos/transparent.png',
    website: 'https://aiventures.example.com',
    description:
      'Venture capital firm focused on AI startups and innovation, providing mentorship and potential funding opportunities for top performers.',
  },
  {
    name: 'PromptLabs',
    tier: 'silver',
    logo: '/media/logos/transparent.png',
    website: 'https://promptlabs.example.com',
    description:
      'Specialized prompt engineering tools and resources for professionals, offering premium access to Neo League participants.',
  },
  {
    name: 'EduTech',
    tier: 'bronze',
    logo: '/media/logos/transparent.png',
    website: 'https://edutech.example.com',
    description:
      'Educational technology company providing learning resources and certification opportunities for prompt engineering skills.',
  },
  {
    name: 'InnovateAI',
    tier: 'bronze',
    logo: '/media/logos/transparent.png',
    website: 'https://innovateai.example.com',
    description:
      'AI innovation hub supporting emerging technologies and connecting Neo League participants with industry opportunities.',
  },
];

export const contributors: Contributor[] = [
  {
    name: 'RMIT University',
    contribution:
      'Academic support and venue hosting for the final competition',
    image: '/media/logos/transparent.png',
  },
  {
    name: 'AI Research Community',
    contribution: 'Challenge design and technical advisory',
    image: '/media/logos/transparent.png',
  },
  {
    name: 'Volunteer Mentors',
    contribution: 'Providing guidance and support to Neo League participants',
    image: '/media/logos/transparent.png',
  },
  {
    name: 'Industry Experts',
    contribution: 'Judging panel and masterclass sessions',
    image: '/media/logos/transparent.png',
  },
  {
    name: 'Student Ambassadors',
    contribution: 'Campus outreach and participant support',
    image: '/media/logos/transparent.png',
  },
  {
    name: 'Open Source Community',
    contribution: 'Various libraries and tools used in the platform',
    image: '/media/logos/transparent.png',
  },
  {
    name: 'Beta Testers',
    contribution: 'Platform testing and feedback before launch',
    image: '/media/logos/transparent.png',
  },
  {
    name: 'Media Partners',
    contribution: 'Coverage and promotion of the Neo League competition',
    image: '/media/logos/transparent.png',
  },
];

export const academicMentors: TeamMember[] = [
  {
    name: 'Dr. Linh Tran',
    role: 'Lecturer',
    image: '/media/logos/transparent.png',
    bio: 'Dr. Zhang specializes in natural language processing and has pioneered research in prompt engineering methodologies for large language models.',
    organization: 'RMIT University',
    links: {
      linkedin: 'https://linkedin.com/in/emilyzhang',
      website: 'https://emilyzhang.ai',
      twitter: 'https://twitter.com/emilyzhang_ai',
    },
  },
  {
    name: 'Dr. Thanh Pham',
    role: 'Lecturer',
    image: '/media/logos/transparent.png',
    bio: 'Professor Wilson has contributed groundbreaking research on the intersection of linguistics and AI, helping develop the theoretical foundations of prompt engineering.',
    organization: 'RMIT University',
    links: {
      linkedin: 'https://linkedin.com/in/jameswilson',
      website: 'https://stanford.edu/~jwilson',
    },
  },
  {
    name: 'Dr. Tom Huynh',
    role: 'Lecturer',
    image: '/media/logos/transparent.png',
    bio: 'Dr. Nguyen focuses on optimizing human-AI collaboration through effective prompt design, with special emphasis on educational applications.',
    organization: 'RMIT University',
    links: {
      linkedin: 'https://linkedin.com/in/sophianguyen',
      twitter: 'https://twitter.com/sophia_ai_hci',
      github: 'https://github.com/sophianguyen',
    },
  },
];
