export type Project = {
  name: string;
  description?: string;
  type: 'web' | 'software' | 'hardware';
  manager?: string;
  techStack?: string[];
  purpose: string;
  status: 'planning' | 'ongoing' | 'completed';
  semester: string;
  members?: { name: string; role: string }[];
  githubUrl?: string;
  demoUrl?: string;
  image?: string;
};

const NCT_REPO_URL = 'https://github.com/rmit-nct/hub';

export const projects: Project[] = [
  {
    name: 'Neo Storage Console',
    description:
      'A console-based application for user authentication and item tracking. Provides a simple, local solution for managing item ownership without web complexity.',
    type: 'software',
    techStack: ['C++'],
    status: 'completed',
    semester: 'B/2025',
    manager: 'Nguyen Don Gia Phat',
    members: [
      {
        name: 'Nguyen Don Gia Phat',
        role: 'Leader, Developer',
      },
      {
        name: 'Truong Tan Quang',
        role: 'Developer',
      },
      {
        name: 'Phan Hoang Khang',
        role: 'Developer',
      },
      {
        name: 'Tran Hoang Minh',
        role: 'Developer',
      },
      {
        name: 'Do Le Minh Quan',
        role: 'Developer',
      },
    ],
    purpose:
      'This research project aims to demystify blockchain technology beyond buzzwords, covering consensus mechanisms (PoW), smart contracts, digital signatures, and real-world applications in healthcare and supply chains. Through practical Python implementation, it demonstrates how blockchain data is securely linked, verified, and made immutable.',
    githubUrl: 'https://github.com/rmit-nct/neo-storage-console',
  },
  {
    name: 'Blockchain Research',
    description:
      'A blockchain research project exploring distributed ledger technology through Python implementation, covering consensus mechanisms, smart contracts, and real-world applications.',
    type: 'software',
    techStack: ['Python'],
    status: 'completed',
    semester: 'A/2025',
    manager: 'Truong Gia Hy',
    members: [
      {
        name: 'Truong Gia Hy',
        role: 'Leader/Researcher',
      },
      {
        name: 'Nguyen Trong Tien',
        role: 'Developer/Researcher',
      },
      {
        name: 'Truong Tan Quang',
        role: 'Developer/Researcher',
      },
      {
        name: 'Do Le Minh Quan',
        role: 'Developer/Researcher',
      },
      {
        name: 'Phan Hoang Khang',
        role: 'Developer/Researcher',
      },
    ],
    purpose:
      'This research project aims to demystify blockchain technology beyond buzzwords, covering consensus mechanisms (PoW), smart contracts, digital signatures, and real-world applications in healthcare and supply chains. Through practical Python implementation, it demonstrates how blockchain data is securely linked, verified, and made immutable.',
    githubUrl: 'https://github.com/rmit-nct/blockchain-research',
    demoUrl:
      'https://www.linkedin.com/posts/rmit-nct_nct-research-unlocking-the-blockchain-blueprint-activity-7341333200109019138-lEd3?utm_source=share&utm_medium=member_desktop&rcm=ACoAAD1jrHcBcl7zQonu5cQd6QpLMvK6AS-LWyc',
  },
  {
    name: '[Ga] Remote-Controlled Car',
    description:
      'A remote-controlled car project featuring wireless control, real-time video streaming, and autonomous navigation capabilities.',
    type: 'hardware',
    techStack: ['Arduino', 'C++', 'Solid Work'],
    status: 'completed',
    semester: 'A/2025',
    manager: 'Le Van Chi Hoang',
    members: [
      {
        name: 'Le Van Chi Hoang',
        role: 'Leader, Hardware Developer',
      },
      {
        name: 'Nguyen Ngoc Thien Ngan',
        role: 'Hardware Developer',
      },
      {
        name: 'Duong The Vong',
        role: 'Software Engineer',
      },
      {
        name: 'Vo Dang Khoa',
        role: 'Software Developer',
      },
    ],
    purpose:
      'This project aims to create an advanced remote-controlled vehicle with wireless control capabilities, demonstrating embedded systems programming and hardware integration skills.',
    githubUrl: 'https://github.com/rmit-nct/remote-car-ga',
    image: '/media/projects/remote-car-3.jpeg',
  },
  {
    name: '[minhmoi] Remote-Controlled Car',
    description:
      'A remote-controlled car project featuring wireless control, real-time video streaming, and autonomous navigation capabilities.',
    type: 'hardware',
    techStack: ['Arduino', 'C++', 'Solid Work'],
    status: 'completed',
    semester: 'A/2025',
    manager: 'Cu Dinh Bach',
    members: [
      {
        name: 'Cu Dinh Bach',
        role: 'Leader, Hardware Developer',
      },
      {
        name: 'Nguyen Do Tuong Van',
        role: 'Hardware Developer',
      },
      {
        name: 'Tran Hoang Minh',
        role: 'Software Engineer',
      },
      {
        name: 'Nguyen Nghia Hiep',
        role: 'Software Developer',
      },
    ],
    purpose:
      'This project aims to create an advanced remote-controlled vehicle with wireless control capabilities, demonstrating embedded systems programming and hardware integration skills.',
    githubUrl: 'https://github.com/rmit-nct/remote-car-minhmoi',
    image: '/media/projects/remote-car-2.jpg',
  },
  {
    name: '[TDOC] Remote-Controlled Car',
    description:
      'A remote-controlled car project featuring wireless control, real-time video streaming, and autonomous navigation capabilities.',
    type: 'hardware',
    techStack: ['Arduino', 'C++', 'Solid Work'],
    status: 'completed',
    semester: 'A/2025',
    manager: 'Truong Duc Qui',
    members: [
      {
        name: 'Truong Duc Qui',
        role: 'Leader, Hardware Engineer',
      },
      {
        name: 'Mai Dang Khoa',
        role: 'Hardware Engineer',
      },
      {
        name: 'Pham Le Hoang Phu',
        role: 'Software Developer',
      },
    ],
    purpose:
      'This project aims to create an advanced remote-controlled vehicle with wireless control capabilities, demonstrating embedded systems programming and hardware integration skills.',
    githubUrl: 'https://github.com/rmit-nct/remote-car-three-dudes-one-car',
    demoUrl: 'https://www.youtube.com/watch?v=myx7Zmuy4rU',
    image: '/media/projects/remote-car-1.jpg',
  },
  {
    name: 'NCT Krypto',
    description:
      'A real-time cryptocurrency price tracking application that displays live market data, price charts, and market trends for various cryptocurrencies.',
    type: 'web',
    techStack: ['Next.js', 'Typescript', 'Tailwind CSS'],
    status: 'completed',
    semester: 'A/2025',
    manager: 'Nguyen An Nhien',
    members: [
      {
        name: 'Nguyen An Nhien',
        role: 'Leader, Hardware Engineer',
      },
      {
        name: 'Chau Tung Nguyen',
        role: 'Developer',
      },
      {
        name: 'Nguyen Don Gia Phat',
        role: 'Web Designer',
      },
      {
        name: 'Nguyen Phuong Anh',
        role: 'Web Designer',
      },
      {
        name: 'Tran Dang Phuc',
        role: 'Web Designer',
      },
    ],
    purpose:
      'This project aims to provide users with up-to-date cryptocurrency market information, enabling them to monitor price movements, analyze trends, and make informed decisions about digital assets.',
    githubUrl: 'https://github.com/rmit-nct/nct-krypto',
    image: '/media/projects/nct-krypto.png',
  },
  {
    name: 'NCT Landing Page v2',
    description:
      'A completely redesigned landing page with modern UI/UX, enhanced user experience, and improved visual appeal.',
    type: 'web',
    techStack: ['Next.js', 'Typescript', 'Tailwind CSS'],
    status: 'completed',
    semester: 'A/2025',
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
    semester: 'A/2025',
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
    semester: 'C/2024',
    manager: 'Huynh Hoang Duc',
    purpose:
      'This project aims to create a sophisticated micromouse capable of navigating mazes efficiently.',
    members: [
      { name: 'Huynh Hoang Duc', role: 'Leader, Hardware Engineer' },
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
    semester: 'B/2024',
    manager: 'Luong Ngoc Bao Tran',
    purpose:
      'A short-term project to demonstrate realtime multiplayer game development with cutting-edge technologies.',
    members: [
      { name: 'Luong Ngoc Bao Tran', role: 'Leader, Developer' },
      { name: 'Vo Hoang Phuc', role: 'Developer' },
    ],
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
    semester: 'B/2024',
    manager: 'Vo Hoang Phuc',
    members: [
      { name: 'Vo Hoang Phuc', role: 'Leader, Developer' },
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
    semester: 'B/2024',
    manager: 'Ngo Van Tai',
    purpose:
      'A revamp of the club landing page to showcase the club projects and activities.',

    members: [
      { name: 'Ngo Van Tai', role: 'Leader, Developer' },
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
    semester: 'B/2024',
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
