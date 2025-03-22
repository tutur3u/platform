export type OrganizerTranslation = {
  name: string;
  role: string;
  organization: string;
  bio: string;
};
// export interface TeamMember {
//   name: string;
//   role: string;
//   image: string;
//   bio: string;
//   links?: {
//     twitter?: string;
//     linkedin?: string;
//     github?: string;
//     website?: string;
//     email?: string;
//   };
//   organization?: string;
// }
export interface TeamMember {
  tKey: string;
  image: string;
  links?: {
    twitter?: string;
    linkedin?: string;
    github?: string;
    website?: string;
    email?: string;
  };
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
    tKey: 'vo-hoang-phuc',
    image: '/media/featured/competitions/neo-league/vo-hoang-phuc.jpg',
  },
  {
    tKey: 'nguyen-yen-ngoc',
    image: '/media/featured/competitions/neo-league/nguyen-yen-ngoc.jpeg',
  },
  {
    tKey: 'doan-huu-quoc',
    image: '/media/featured/competitions/neo-league/doan-huu-quoc.jpg',
  },
  {
    tKey: 'cao-nguyen-viet-quang',
    image: '/media/featured/competitions/neo-league/cao-nguyen-viet-quang.jpg',
  },
  {
    tKey: 'dao-ngoc-khanh',
    image: '/media/featured/competitions/neo-league/dao-ngoc-khanh.jpg',
  },
  {
    tKey: 'ngo-van-tai',
    image: '/media/featured/competitions/neo-league/ngo-van-tai.jpg',
  },
  {
    tKey: 'huynh-tan-phat',
    image: '/media/featured/competitions/neo-league/huynh-tan-phat.jpg',
  },
  {
    tKey: 'huynh-hoang-duc',
    image: '/media/featured/competitions/neo-league/huynh-hoang-duc.jpg',
  },
  {
    tKey: 'nguyen-vo-phuong-quynh',
    image: '/media/featured/competitions/neo-league/nguyen-vo-phuong-quynh.jpg',
  },
  {
    tKey: 'tran-duc-linh',
    image: '/media/featured/competitions/neo-league/tran-duc-linh.png',
  },
  {
    tKey: 'pham-chi-thanh',
    image: '/media/featured/competitions/neo-league/pham-chi-thanh.jpeg',
  },
  {
    tKey: 'tom-huynh',
    image: '/media/featured/competitions/neo-league/tom-huynh.jpeg',
  },
];

// export const organizers: TeamMember[] = [
//   {
//     name: 'Võ Hoàng Phúc',
//     role: 'Nova Project Leader',
//     image: '/media/featured/competitions/neo-league/vo-hoang-phuc.jpg',
//     bio: 'Build the platform and ensure the competition is run smoothly, with a focus on the technical aspects.',
//     organization: 'Tuturuuu',
//   },
//   {
//     name: 'Nguyễn Yến Ngọc',
//     role: 'Nova External Affairs Leader',
//     image: '/media/featured/competitions/neo-league/nguyen-yen-ngoc.jpeg',
//     bio: 'Work with external organizations and stakeholders to ensure the competition is successful.',
//     organization: 'Tuturuuu',
//   },
//   {
//     name: 'Đoàn Hữu Quốc',
//     role: 'Nova Quality Assurance Leader',
//     image: '/media/featured/competitions/neo-league/doan-huu-quoc.jpg',
//     bio: 'Ensure the platform is of high quality and intuitive, with a focus on the user experience.',
//     organization: 'ZenBright',
//   },
//   {
//     name: 'Cao Nguyễn Việt Quang',
//     role: 'Neo League Project Leader & External Affairs Leader',
//     image: '/media/featured/competitions/neo-league/cao-nguyen-viet-quang.jpg',
//     bio: 'Supervise the project and ensure the competition is run smoothly.',
//     organization: 'RMIT SGS Neo Culture Tech',
//   },
//   {
//     name: 'Đào Ngọc Khanh',
//     role: 'Neo League Project Co-leader & Marketing and Communications Leader',
//     image: '/media/featured/competitions/neo-league/dao-ngoc-khanh.jpg',
//     bio: 'Promote the competition and build the community.',
//     organization: 'RMIT SGS Neo Culture Tech',
//   },
//   {
//     name: 'Ngô Văn Tài',
//     role: 'Neo League Program Leader',
//     image: '/media/featured/competitions/neo-league/ngo-van-tai.jpg',
//     bio: 'Handle everything related to the program, including the competition and the community.',
//     organization: 'RMIT SGS Neo Culture Tech',
//   },
//   {
//     name: 'Huỳnh Tấn Phát',
//     role: 'Neo League Logistic and Finance Leader',
//     image: '/media/featured/competitions/neo-league/huynh-tan-phat.jpg',
//     bio: 'Handle the logistics and finance of the competition.',
//     organization: 'RMIT SGS Neo Culture Tech',
//   },
//   {
//     name: 'Huỳnh Hoàng Đức',
//     role: 'Neo League Internal Affairs Leader',
//     image: '/media/featured/competitions/neo-league/huynh-hoang-duc.jpg',
//     bio: 'Handle the internal affairs of the competition.',
//     organization: 'RMIT SGS Neo Culture Tech',
//   },
//   {
//     name: 'Nguyễn Võ Phương Quỳnh',
//     role: 'Neo League Creative Leader',
//     image: '/media/featured/competitions/neo-league/nguyen-vo-phuong-quynh.jpg',
//     bio: 'Handle the creative aspects of the competition.',
//     organization: 'RMIT SGS Neo Culture Tech',
//   },
//   {
//     name: 'Dr. Trần Đức Linh',
//     role: 'Neo League Academic Mentor',
//     image: '/media/featured/competitions/neo-league/tran-duc-linh.png',
//     bio: 'Provide guidance and compile challenges for the competition.',
//     organization: 'RMIT University',
//   },
//   {
//     name: 'Dr. Phạm Chí Thanh',
//     role: 'Neo League Academic Mentor',
//     image: '/media/featured/competitions/neo-league/pham-chi-thanh.jpeg',
//     bio: 'Provide guidance and compile challenges for the competition.',
//     organization: 'RMIT University',
//   },
//   {
//     name: 'Dr. Tom Huynh',
//     role: 'Neo League Academic Mentor',
//     image: '/media/featured/competitions/neo-league/tom-huynh.jpeg',
//     bio: 'Provide guidance and compile challenges for the competition.',
//     organization: 'RMIT University',
//   },
// ];

export const platformBuilders: TeamMember[] = [
  {
    tKey: 'vo-hoang-phuc',
    image: '/media/featured/competitions/neo-league/vo-hoang-phuc.jpg',
  },
  {
    tKey: 'huynh-tan-phat',
    image: '/media/featured/competitions/neo-league/huynh-tan-phat.jpg',
  },
  {
    tKey: 'nguyen-gia-khang',
    image: '/media/featured/competitions/neo-league/nguyen-gia-khang.jpg',
  },
  {
    tKey: 'ngo-van-tai',
    image: '/media/featured/competitions/neo-league/ngo-van-tai.jpg',
  },
  {
    tKey: 'huynh-thai-duong',
    image: '/media/featured/competitions/neo-league/huynh-thai-duong.jpg',
  },
];

// export const platformBuilders: TeamMember[] = [
//   {
//     name: 'Võ Hoàng Phúc',
//     role: 'Lead Developer',
//     image: '/media/featured/competitions/neo-league/vo-hoang-phuc.jpg',
//     bio: 'Core maintainer of Tuturuuu and Nova, with a passion for building tools that help people be more productive and creative.',
//     organization: 'Tuturuuu',
//   },
//   {
//     name: 'Huỳnh Tấn Phát',
//     role: 'Fullstack Engineer',
//     image: '/media/featured/competitions/neo-league/huynh-tan-phat.jpg',
//     bio: 'Build the foundation of the Neo League platform, with a focus on scalability and performance.',
//     organization: 'RMIT SGS Neo Culture Tech',
//   },
//   {
//     name: 'Nguyễn Gia Khang',
//     role: 'Fullstack Engineer',
//     image: '/media/featured/competitions/neo-league/nguyen-gia-khang.jpg',
//     bio: 'Enhance the user experience of the Neo League platform, with a focus on usability and accessibility.',
//     organization: 'RMIT SGS Neo Culture Tech',
//   },
//   {
//     name: 'Ngô Văn Tài',
//     role: 'Fullstack Engineer',
//     image: '/media/featured/competitions/neo-league/ngo-van-tai.jpg',
//     bio: 'Ensure translation of the Neo League platform to Vietnamese, with a focus on readability and accessibility.',
//     organization: 'RMIT SGS Neo Culture Tech',
//   },
//   {
//     name: 'Huỳnh Thái Dương',
//     role: 'Frontend Engineer',
//     image: '/media/featured/competitions/neo-league/huynh-thai-duong.jpg',
//     bio: 'Ensure the frontend of the Neo League platform is responsive and user-friendly.',
//     organization: 'RMIT SGS Neo Culture Tech',
//   },
// ];

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
  },
  {
    name: 'AI Research Community',
    contribution: 'Challenge design and technical advisory',
  },
  {
    name: 'Volunteer Mentors',
    contribution: 'Providing guidance and support to Neo League participants',
  },
  {
    name: 'Industry Experts',
    contribution: 'Judging panel and masterclass sessions',
  },
  {
    name: 'Student Ambassadors',
    contribution: 'Campus outreach and participant support',
  },
  {
    name: 'Open Source Community',
    contribution: 'Various libraries and tools used in the platform',
  },
  {
    name: 'Beta Testers',
    contribution: 'Platform testing and feedback before launch',
  },
  {
    name: 'Media Partners',
    contribution: 'Coverage and promotion of the Neo League competition',
  },
];
