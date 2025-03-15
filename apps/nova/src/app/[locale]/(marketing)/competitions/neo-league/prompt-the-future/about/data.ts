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
  tier: 'host' | 'platinum' | 'gold' | 'silver' | 'bronze';
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
    name: 'Cao Nguyễn Việt Quang',
    role: 'Project Leader / External Affairs Leader',
    image: '/media/featured/competitions/neo-league/cao-nguyen-viet-quang.jpg',
    bio: 'Supervise the project and ensure the competition is run smoothly.',
    organization: 'RMIT SGS Neo Culture Tech',
  },
  {
    name: 'Đào Ngọc Khanh',
    role: 'Project Co-leader / Marketing and Communications Leader',
    image: '/media/featured/competitions/neo-league/dao-ngoc-khanh.jpg',
    bio: 'Promote the competition and build the community.',
    organization: 'RMIT SGS Neo Culture Tech',
  },
  {
    name: 'Võ Hoàng Phúc',
    role: 'Technical Leader',
    image: '/media/featured/competitions/neo-league/vo-hoang-phuc.jpg',
    bio: 'Build the platform and ensure the competition is run smoothly, with a focus on the technical aspects.',
    organization: 'Tuturuuu',
  },
  {
    name: 'Ngô Văn Tài',
    role: 'Program Leader',
    image: '/media/featured/competitions/neo-league/ngo-van-tai.jpg',
    bio: 'Handle everything related to the program, including the competition and the community.',
    organization: 'RMIT SGS Neo Culture Tech',
  },
  {
    name: 'Huỳnh Tấn Phát',
    role: 'Logistic and Finance Leader',
    image: '/media/featured/competitions/neo-league/huynh-tan-phat.jpg',
    bio: 'Handle the logistics and finance of the competition.',
    organization: 'RMIT SGS Neo Culture Tech',
  },
  {
    name: 'Huỳnh Hoàng Đức',
    role: 'Internal Affairs Leader',
    image: '/media/featured/competitions/neo-league/huynh-hoang-duc.jpg',
    bio: 'Handle the internal affairs of the competition.',
    organization: 'RMIT SGS Neo Culture Tech',
  },
  {
    name: 'Nguyễn Võ Phương Quỳnh',
    role: 'Creative Leader',
    image: '/media/featured/competitions/neo-league/nguyen-vo-phuong-quynh.jpg',
    bio: 'Handle the creative aspects of the competition.',
    organization: 'RMIT SGS Neo Culture Tech',
  },
];

export const platformBuilders: TeamMember[] = [
  {
    name: 'Võ Hoàng Phúc',
    role: 'Lead Developer',
    image: '/media/featured/competitions/neo-league/vo-hoang-phuc.jpg',
    bio: 'Core maintainer of Tuturuuu and Nova, with a passion for building tools that help people be more productive and creative.',
    organization: 'Tuturuuu',
  },
  {
    name: 'Huỳnh Tấn Phát',
    role: 'Fullstack Engineer',
    image: '/media/featured/competitions/neo-league/huynh-tan-phat.jpg',
    bio: 'Build the foundation of the Neo League platform, with a focus on scalability and performance.',
    organization: 'RMIT SGS Neo Culture Tech',
  },
  {
    name: 'Nguyễn Gia Khang',
    role: 'Fullstack Engineer',
    image: '/media/featured/competitions/neo-league/nguyen-gia-khang.jpg',
    bio: 'Enhance the user experience of the Neo League platform, with a focus on usability and accessibility.',
    organization: 'RMIT SGS Neo Culture Tech',
  },
  {
    name: 'Ngô Văn Tài',
    role: 'Fullstack Engineer',
    image: '/media/featured/competitions/neo-league/ngo-van-tai.jpg',
    bio: 'Ensure translation of the Neo League platform to Vietnamese, with a focus on readability and accessibility.',
    organization: 'RMIT SGS Neo Culture Tech',
  },
  {
    name: 'Huỳnh Thái Dương',
    role: 'Frontend Engineer',
    image: '/media/featured/competitions/neo-league/huynh-thai-duong.jpg',
    bio: 'Ensure the frontend of the Neo League platform is responsive and user-friendly.',
    organization: 'RMIT SGS Neo Culture Tech',
  },
];

export const sponsors: Sponsor[] = [
  {
    name: 'Tuturuuu',
    tier: 'host',
    logo: '/media/logos/light.png',
    website: 'https://tuturuuu.com',
    description:
      'Pioneer in AI and smart productivity tools, providing technical and platform support for the Neo League competition. Tuturuuu Nova is revolutionizing how we interact with AI through advanced prompt engineering.',
  },
  {
    name: 'RMIT SGS Neo Culture Tech',
    tier: 'host',
    logo: '/media/featured/competitions/neo-league/nct.jpg',
    website: 'https://rmitnct.club',
    description:
      'Host of the Neo League - Prompt the Future 2025 competition, dedicated to fostering innovation and technical excellence in AI and prompt engineering among students.',
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
    image: '/media/featured/competitions/neo-league/tran-duc-linh.png',
    bio: 'As a passionate educator and experienced researcher, his recent work explores the applications of advanced technologies, particularly AI and generative AI, in education to make learning more inclusive and effective.',
    organization: 'RMIT University',
  },
  {
    name: 'Dr. Thanh Pham',
    role: 'Lecturer',
    image: '/media/featured/competitions/neo-league/pham-chi-thanh.jpeg',
    bio: 'Research in electronics, AI, data science, robotics, and engineering education. Broad engineering and computer science expertise.',
    organization: 'RMIT University',
  },
  {
    name: 'Dr. Tom Huynh',
    role: 'Lecturer',
    image: '/media/featured/competitions/neo-league/tom-huynh.jpeg',
    bio: 'IT/Software Engineering lecturer at RMIT Vietnam with expertise in programming, web/mobile development, and machine learning. Extensive industry experience in both academia and tech companies.',
    organization: 'RMIT University',
  },
];
