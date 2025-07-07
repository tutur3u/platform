export type Project = {
  name: string;
  description?: string;
  type: 'web' | 'software' | 'hardware';
  manager?: string;
  techStack?: string[];
  purpose: string;
  status: 'planning' | 'ongoing' | 'completed';
  members?: { name: string; role: string }[];
  githubUrl?: string;
  demoUrl?: string;
  image?: string;
};

const NCT_REPO_URL = 'https://github.com/rmit-nct/hub';

export const projects: Project[] = [
  {
    name: 'NCT Landing Page v2',
    description:
      'A completely redesigned landing page with modern UI/UX, enhanced user experience, and improved visual appeal.',
    type: 'web',
    techStack: ['Next.js', 'Typescript', 'Tailwind CSS'],
    status: 'completed',
    manager: 'Nguyen Gia Khang',
    purpose:
      "This project aims to create a more engaging and visually appealing landing page that better represents the club's identity and showcases our projects with improved design and user experience.",
    demoUrl:
      process.env.NODE_ENV === 'development'
        ? 'http://localhost:7803'
        : 'https://rmitnct.club/',
    githubUrl: NCT_REPO_URL,
  },
  {
    name: 'Neo Scanner',
    description:
      "An ID scanner used to retrieve student's name and ID in events.",
    type: 'web',
    techStack: ['Python', 'React.js'],
    status: 'completed',
    manager: 'Nguyen Gia Khang',
    purpose:
      "This project aims to save time for gathering participant's information.",
    demoUrl:
      process.env.NODE_ENV === 'development'
        ? 'http://localhost:7803/scanner'
        : 'https://rmitnct.club/scanner',
    githubUrl: NCT_REPO_URL,
  },
  {
    name: 'Neo Micromouse',
    description:
      'A micromouse robot with manual control and automatic navigation.',
    type: 'hardware',
    techStack: ['Arduino', 'C++', 'PlatformIO'],
    status: 'completed',
    manager: 'Huynh Hoang Duc',
    purpose:
      'This project aims to create a sophisticated micromouse capable of navigating mazes efficiently.',
    members: [
      { name: 'Pham Ngoc Phu Vinh', role: 'Hardware Engineer' },
      { name: 'Tran Thanh Sang', role: 'Hardware Engineer' },
      { name: 'Nguyen Gia Khang', role: 'Software Developer' },
      { name: 'Tran Viet Duc', role: 'Software Developer' },
      { name: 'Ngo Van Tai', role: 'CAD Designer' },
      { name: 'Huynh Thai Duong', role: 'CAD Designer' },
    ],
  },
  {
    name: 'Neo Chess',
    description:
      'An in-house chess game with multiplayer and AI-based opponent.',
    type: 'web',
    techStack: [
      'Next.js',
      'Typescript',
      'Tailwind CSS',
      'Supabase Realtime',
      'Shadcn UI',
    ],
    status: 'completed',
    manager: 'Luong Ngoc Bao Tran',
    purpose:
      'A short-term project to demonstrate realtime multiplayer game development with cutting-edge technologies.',
    members: [{ name: 'Vo Hoang Phuc', role: 'Developer' }],
    githubUrl: NCT_REPO_URL,
    demoUrl:
      process.env.NODE_ENV === 'development'
        ? 'http://localhost:7803/neo-chess'
        : 'https://rmitnct.club/neo-chess',
  },
  {
    name: 'Neo Crush',
    description:
      'The first stable release of Neo Crush with new features and improvements.',
    type: 'web',
    techStack: [
      'Next.js',
      'Typescript',
      'Tailwind CSS',
      'Supabase Realtime',
      'Shadcn UI',
    ],
    status: 'completed',
    manager: 'Vo Hoang Phuc',
    members: [
      { name: 'Huynh Tan Phat', role: 'Developer' },
      { name: 'Nguyen Gia Khang', role: 'Developer' },
      { name: 'Luong Ngoc Bao Tran', role: 'Developer' },
      { name: 'Nguyen Phuc Quynh Nhu', role: 'Designer' },
    ],
    purpose:
      'A short-term project to demonstrate realtime multiplayer game development with cutting-edge technologies.',
    githubUrl: NCT_REPO_URL,
    demoUrl:
      process.env.NODE_ENV === 'development'
        ? 'http://localhost:7803/neo-crush'
        : 'https://rmitnct.club/neo-crush',
  },
  {
    name: 'NCT Hub Landing Page',
    description:
      "The landing page showcasing the club's projects and activities.",
    type: 'web',
    techStack: ['Next.js', 'Typescript', 'Tailwind CSS'],
    status: 'completed',
    manager: 'Ngo Van Tai',
    purpose:
      'A revamp of the club landing page to showcase the club projects and activities.',

    members: [
      { name: 'Nguyen Phuong Anh', role: 'Developer' },
      { name: 'Luong Ngoc Bao Tran', role: 'Developer' },
      { name: 'Huynh Ngoc Nhat Mai', role: 'Developer' },
      { name: 'Nguyen Gia Khang', role: 'Developer' },
      { name: 'Tran Minh Thuan', role: 'Designer' },
      { name: 'Nguyen Phuc Quynh Nhu', role: 'Designer' },
    ],
    githubUrl: NCT_REPO_URL,
    demoUrl:
      process.env.NODE_ENV === 'development'
        ? 'http://localhost:7803/'
        : 'https://rmitnct.club/',
  },
  {
    name: 'NCT Hub',
    description:
      'The official web-based platform for RMIT Neo Culture Tech, based on Tuturuuu.',
    type: 'web',
    techStack: [
      'Next.js',
      'Turborepo',
      'Typescript',
      'Tailwind CSS',
      'Supabase',
      'Shadcn UI',
    ],
    status: 'completed',
    manager: 'Vo Hoang Phuc',
    purpose:
      'An informative digital platform for visitors as well as all-in-one management platform for core team members.',
    githubUrl: 'https://github.com/rmit-nct/hub',
    demoUrl:
      process.env.NODE_ENV === 'development'
        ? 'http://localhost:7803/'
        : 'https://rmitnct.club/',
    image: '/media/marketing/nct-hub-dashboard.jpg',
  },
];
