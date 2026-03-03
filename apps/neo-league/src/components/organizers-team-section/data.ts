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
      'Designing and managing competition content, challenges, participant experience, and building the website.',
    members: [
      {
        name: 'Tai Ngo',
        role: 'Team Leader',
        avatar: '/organizer-team/program/tai.png',
      },
      {
        name: 'Khang Nguyen',
        role: 'Website Leader',
        avatar: '/organizer-team/program/khang-nguyen.png',
      },
      {
        name: 'Dat Pham',
        role: 'Member',
        avatar: '/organizer-team/program/dat-pham.png',
      },
      {
        name: 'Phuc Huynh',
        role: 'Member',
        avatar: '/organizer-team/program/phuc-huynh.png',
      },
      {
        name: 'Dung Dao',
        role: 'Member',
        avatar: '/organizer-team/program/dung-dao.png',
      },
      {
        name: 'Khang Phan',
        role: 'Member',
        avatar: '/organizer-team/program/khang-phan.png',
      },
    ],
  },
  {
    name: 'External Affairs',
    description:
      'Managing partnerships, sponsorships, and external communications.',
    members: [
      {
        name: 'Tam Nguyen',
        role: 'Team Leader',
        avatar: '/organizer-team/external-affairs/tam.png',
      },
    ],
  },
  {
    name: 'Marcom',
    description:
      'Crafting brand messaging, social media content, and promotional campaigns.',
    members: [
      {
        name: 'Nhat Vo',
        role: 'Team leader',
        avatar: '/organizer-team/marcom/nhat.png',
      },
    ],
  },
  {
    name: 'Internal Affairs',
    description: 'Coordinating team operations and internal communications.',
    members: [
      {
        name: 'Tin Lam',
        role: 'Team Leader',
        avatar: '/organizer-team/internal-affairs/tin-lam.png',
      },
      {
        name: 'Nhat Nguyen',
        role: 'Member',
        avatar: '/organizer-team/internal-affairs/nhat-nguyen.png',
      },
      {
        name: 'Khanh Tran',
        role: 'Member',
        avatar: '/organizer-team/internal-affairs/khanh-tran.png',
      },
      {
        name: 'Anh Nguyen',
        role: 'Member',
        avatar: '/organizer-team/internal-affairs/anh-nguyen.png',
      },
      {
        name: 'Phuong Tran',
        role: 'Member',
        avatar: '/organizer-team/internal-affairs/phuong-tran.png',
      },
    ],
  },
  {
    name: 'Logistic',
    description: 'Managing venues, equipment, and operational logistics.',
    members: [
      {
        name: 'Kim Pham',
        role: 'Team Leader',
        avatar: '/organizer-team/logistic/kim.png',
      },
      {
        name: 'Kim Huynh',
        role: 'Member',
        avatar: '/organizer-team/logistic/kim-huynh.png',
      },
      {
        name: 'Ngoc Tran',
        role: 'Member',
        avatar: '/organizer-team/logistic/ngoc-tran.png',
      },
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
