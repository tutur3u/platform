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
  tKey: string;
  tier:
    | 'host'
    | 'partner'
    | 'platinum'
    | 'gold'
    | 'silver'
    | 'bronze'
    | 'diamond';
  logo: string;
  website: string;
}

export interface Contributor {
  tKey: string;
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

export const sponsors: Sponsor[] = [
  {
    tKey: 'tuturuuu',
    tier: 'host',
    logo: '/media/logos/light.png',
    website: 'https://tuturuuu.com',
  },
  {
    tKey: 'rmit-neo-culture-tech',
    tier: 'host',
    logo: '/media/featured/competitions/neo-league/nct.jpg',
    website: 'https://rmitnct.club',
  },
  {
    tKey: 'rmit-sset',
    tier: 'partner',
    logo: '/media/featured/competitions/neo-league/sponsors/rmit.png',
    website: 'https://www.rmit.edu.vn',
  },
  {
    tKey: 'student-council',
    tier: 'partner',
    logo: '/media/featured/competitions/neo-league/sponsors/student-council.png',
    website: 'https://www.rmit.edu.vn',
  },
  {
    tKey: 'aptech',
    tier: 'diamond',
    logo: '/media/featured/competitions/neo-league/sponsors/aptech.png',
    website: 'https://aptechvietnam.com.vn/',
  },
  {
    tKey: 'AICT',
    tier: 'diamond',
    logo: '/media/featured/competitions/neo-league/sponsors/aict.png',
    website: 'https://aict.edu.vn',
  },
  {
    tKey: 'netcompany',
    tier: 'gold',
    logo: '/media/featured/competitions/neo-league/sponsors/netcompany.png',
    website: 'https://netcompany.com/',
  },
  {
    tKey: 'holistics',
    tier: 'gold',
    logo: '/media/featured/competitions/neo-league/sponsors/holistics.png',
    website: 'https://www.holistics.io/',
  },
];

export const contributors: Contributor[] = [
  { tKey: 'rmit-university' },
  { tKey: 'ai-research-community' },
  { tKey: 'volunteer-mentors' },
  { tKey: 'industry-experts' },
  { tKey: 'student-ambassadors' },
  { tKey: 'open-source-community' },
  { tKey: 'beta-testers' },
  { tKey: 'media-partners' },
];
