export interface Member {
  name: string;
  role: string;
  venture: 'Tuturuuu' | 'AICC' | 'Noah';
  avatarUrl?: string;
}

export interface Project {
  id: string;
  name: string;
  url: string;
  previewUrl: string;
}

export const CORE_MEMBERS: Member[] = [
  {
    name: 'Vo Hoang Phuc',
    role: 'Founder & CEO',
    venture: 'Tuturuuu',
    avatarUrl: '/members/phuc-vo.jpg',
  },
  {
    name: 'Nguyen Thuy Tien',
    role: 'Growth Lead',
    venture: 'Tuturuuu',
    avatarUrl: '/members/tien-nguyen.jpeg',
  },
  {
    name: 'Trinh Hoang Xuan Nghi',
    role: 'Co-founder',
    venture: 'AICC',
    avatarUrl: '/members/nghi-trinh-aicc.jpeg',
  },
  {
    name: 'Trinh Phuong Thao',
    role: 'Co-founder',
    venture: 'AICC',
    avatarUrl: '/members/thao-trinh.jpg',
  },
  {
    name: 'Shirin Shujaa',
    role: 'Co-founder',
    venture: 'AICC',
    avatarUrl: '/members/shirin-shujaa.jpeg',
  },
  {
    name: 'Matsumi Toida',
    role: 'Co-founder',
    venture: 'Noah',
    avatarUrl: '/members/toida-matsumi.jpg',
  },
  {
    name: 'Trinh Nhat Nghi',
    role: 'Co-founder',
    venture: 'Noah',
    avatarUrl: '/members/nghi-trinh-noah.jpg',
  },
  {
    name: 'Thai Thi My Yen',
    role: 'Member',
    venture: 'Noah',
    avatarUrl: '/members/yen-thai.jpeg',
  },
];

export const VENTURES: Project[] = [
  {
    id: 'tuturuuu',
    name: 'Tuturuuu',
    url: 'https://tuturuuu.com',
    previewUrl: '/projects/tuturuuu.png',
  },
  {
    id: 'aicc',
    name: 'AICC',
    url: 'https://neuroaicc.com',
    previewUrl: '/projects/aicc.png',
  },
  {
    id: 'noah',
    name: 'Noah',
    url: 'https://noahfloodrescuekit.com',
    previewUrl: '/projects/noah.png',
  },
];
