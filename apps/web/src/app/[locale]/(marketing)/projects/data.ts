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

export const projects: Project[] = [
  {
    name: 'Neo Scanner',
    description:
      "An ID scanner used to retrieve student's name and ID in events.",
    type: 'software',
    techStack: ['Python', 'React.js'],
    status: 'completed',
    manager: 'Nguyen Gia Khang',
    purpose:
      "This project aims to save time for gathering participant's information.",
  },
  {
    name: 'Neo Micromouse',
    description:
      'A micromouse robot with manual control and automatic navigation.',
    type: 'hardware',
    techStack: ['Arduino', 'C++', 'PlatformIO'],
    status: 'ongoing',
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
    githubUrl: 'https://github.com/NCTHub/neo-micromouse',
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
    status: 'ongoing',
    manager: 'Luong Ngoc Bao Tran',
    purpose:
      'A short-term project to demonstrate realtime multiplayer game development with cutting-edge technologies.',
    members: [{ name: 'Vo Hoang Phuc', role: 'Developer' }],
    githubUrl: 'https://github.com/NCTHub/neo-chess',
    demoUrl: 'https://chess.ncthub.org',
    image: '/neo-chess/hero.jpg',
  },
  {
    name: 'Neo Checker',
    description: 'An in-house checkers game that is planning.',
    type: 'web',
    techStack: [
      'Next.js',
      'Typescript',
      'Tailwind CSS',
      'Supabase Realtime',
      'Shadcn UI',
    ],
    status: 'planning',
    manager: 'Vo Hoang Phuc',
    purpose:
      'A short-term project to demonstrate realtime multiplayer game development with cutting-edge technologies.',
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
    status: 'planning',
    manager: 'Vo Hoang Phuc',
    purpose:
      'A short-term project to demonstrate realtime multiplayer game development with cutting-edge technologies.',
  },
  {
    name: 'Neo AI Chatbot',
    description: 'An AI chatbot that is planning.',
    type: 'web',
    techStack: [
      'Next.js',
      'Typescript',
      'Tailwind CSS',
      'Supabase',
      'Shadcn UI',
    ],
    status: 'planning',
    manager: 'Vo Hoang Phuc',
    purpose:
      'A short-term project to demonstrate AI chatbot development with cutting-edge technologies.',
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
    ],
  },
  {
    name: 'Neo Crush Alpha',
    description:
      "An 4-day internal hackathon game that was planned for RMIT Sem B 2024's Club Day.",
    type: 'web',
    techStack: [
      'Next.js',
      'Typescript',
      'Tailwind CSS',
      'Supabase',
      'Shadcn UI',
    ],
    status: 'completed',
    manager: 'Vo Hoang Phuc',
    purpose:
      'A short-term project to demonstrate game development with short deadline.',
    githubUrl: 'https://github.com/NCTHub/neo-crush-alpha',
    demoUrl: 'https://crush.ncthub.org',
    image: '/neo-crush/game-screenshot.jpg',
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
    demoUrl: 'https://ncthub.org',
    image: '/media/marketing/nct-hub-dashboard.jpg',
  },
  {
    name: 'NCT Event Scheduler',
    description:
      'A when2meet-like event scheduler for the club members to organize events.',
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
      'An alternative tool to When2meet with enhances UI/UX and additional features.',
  },
];
