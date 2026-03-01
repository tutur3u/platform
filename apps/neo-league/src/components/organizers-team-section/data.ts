export interface Member {
  name: string;
  role?: string;
  avatar?: string;
}

export interface Team {
  name: string;
  description: string;
  members: Member[];
}

// Team Leaders Section
export const leaders: Member[] = [
  {
    name: 'Ngo Van Tai',
    role: 'Project Leader',
    avatar: '/organizer-team/program/tai.png',
  },
  {
    name: 'Nguyen Ha Gia Tam',
    role: 'Project Leader',
    avatar: '/organizer-team/external-affairs/tam.png',
  },
];

// Teams and their members
export const teams: Team[] = [
  {
    name: 'Program',
    description:
      'Designing and managing competition content, challenges, and participant experience.',
    members: [
      {
        name: 'Tai Ngo',
        role: 'Team Leader',
        avatar: '/organizer-team/program/tai.png',
      },
      { name: 'Nguyen Gia Khang', role: 'Website Leader' },
      // Add more members
    ],
  },
  {
    name: 'External Affairs',
    description:
      'Managing partnerships, sponsorships, and external communications.',
    members: [
      {
        name: 'Nguyen Ha Gia Tam',
        role: 'Team Leader',
        avatar: '/organizer-team/external-affairs/tam.png',
      },
      { name: 'Member 2' },
      // Add more members
    ],
  },
  {
    name: 'Marcom',
    description: 'Communication TBU',
    members: [
      {
        name: 'Nhat Vo',
        role: 'Team leader',
        avatar: '/organizer-team/marcom/nhat.png',
      },
      { name: 'Member 2' },
      // Add more members
    ],
  },
  {
    name: 'Internal Affairs',
    description: 'Coordinating team operations and internal communications.',
    members: [
      { name: 'Kelvin Lam', role: 'Team Leader' },
      {
        name: 'Minh Nhat',
        role: 'Member',
        avatar: '/organizer-team/internal-affairs/minh-nhat.png',
      },
      {
        name: 'Duy Khanh',
        role: 'Member',
        avatar: '/organizer-team/internal-affairs/duy-khanh.png',
      },
      // Add more members
    ],
  },
  {
    name: 'Logistic',
    description: 'Managing venues, equipment, and operational logistics.',
    members: [
      {
        name: 'Thien Kim',
        role: 'Team Leader',
        avatar: '/organizer-team/logistic/kim.png',
      },
      {
        name: 'Mai Kim',
        role: 'Member',
        avatar: '/organizer-team/logistic/mai-kim.png',
      },
      {
        name: 'Bao Ngoc',
        role: 'Member',
        avatar: '/organizer-team/logistic/ngoc.png',
      },
      // Add more members
    ],
  },
  {
    name: 'Finance',
    description:
      'Managing budget, financial planning, and resource allocation.',
    members: [
      {
        name: 'Duc Huynh',
        role: 'Team Leader',
        avatar: '/organizer-team/finance/duc.png',
      },
    ],
  },
];
