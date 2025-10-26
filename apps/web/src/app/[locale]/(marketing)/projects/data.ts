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
  modelFile?: string;
};

const NCT_REPO_URL = 'https://github.com/rmit-nct/hub';

export const projects: Project[] = [
  {
    name: 'Neo Drone',
    description:
      'A drone project powered by the ESP32 microcontroller and programmed with ESP-IDF 5.0. The drone is controlled remotely using the ESP-Drone mobile app (Android), leveraging Wi-Fi communication for real-time flight control and navigation.',
    type: 'hardware',
    techStack: ['ESP32', 'C++', 'Dabble', 'Bluetooth Module'],
    status: 'ongoing',
    semester: 'B/2025',
    manager: 'Truong Duc Qui',
    members: [
      {
        name: 'Truong Duc Qui',
        role: 'Leader, Developer',
      },
      {
        name: 'Vinh Pham',
        role: 'Developer',
      },
      {
        name: 'Nguyen Do Tuong Van',
        role: 'Developer',
      },
      {
        name: 'Nguyen Ngoc Thien Ngan',
        role: 'Developer',
      },
      {
        name: 'Nguyen Quoc Thinh',
        role: 'Developer',
      },
    ],
    purpose:
      'The purpose of this project is to introduce members to embedded development for drones using the ESP32 platform. By working with ESP-IDF 5.0, PowerShell, and the ESP-Drone app, members gain practical experience in firmware development, wireless control systems, and real-time hardware interaction. The project helps bridge the gap between IoT, robotics, and aerospace applications by demonstrating how microcontrollers can be used to build and control flying systems.',
    githubUrl: 'https://github.com/rmit-nct/neo-spider',
  },
  {
    name: 'Neo Spider',
    description:
      'A robotics project using an ESP32 microcontroller, Bluetooth module, and the Dabble mobile app to remotely control a spider-like robot. The system allows wireless movement control and interactive commands through a smartphone interface.',
    type: 'hardware',
    techStack: ['ESP32', 'C++', 'Dabble', 'Bluetooth Module'],
    status: 'ongoing',
    semester: 'B/2025',
    manager: 'Tran Viet Duc',
    members: [
      {
        name: 'Tran Viet Duc',
        role: 'Leader, Developer',
      },
      {
        name: 'Huynh Ngoc Tai',
        role: 'Developer',
      },
      {
        name: 'Nguyen Quoc Huy',
        role: 'CAD Drafter, Developer',
      },
      {
        name: 'Tran Quang Minh',
        role: 'Developer',
      },
    ],
    purpose:
      'The purpose of this project is to help members explore embedded systems, wireless communication, and robotics control. By integrating the ESP32 with Bluetooth and Dabble, members gain hands-on experience in hardware programming, mobile connectivity, and real-time robot navigation, simulating practical applications in IoT and remote automation.',
    githubUrl: 'https://github.com/rmit-nct/neo-drone',
  },
  {
    name: 'Neo Display',
    description:
      'A C++ project using Arduino UNO to control and display information on an ST7920 LCD screen, such as text, menus, or simple graphics.',
    type: 'hardware',
    techStack: ['Arduino UNO', 'C++', 'ST7920'],
    status: 'completed',
    semester: 'B/2025',
    manager: 'Huynh Trong Khiem',
    members: [
      {
        name: 'Huynh Trong Khiem',
        role: 'Leader, Developer',
      },
      {
        name: 'Duong The Vong',
        role: 'Developer',
      },
      {
        name: 'Nguyen Tran Tuan Anh',
        role: 'Developer',
      },
    ],
    purpose:
      'The purpose of this project is to help members learn embedded programming with Arduino, focusing on how microcontrollers communicate with external hardware. By working with the ST7920 LCD, members will gain practical experience in C++ coding for hardware, serial communication, and real-time data display.',
  },
  {
    name: 'Neo Agent Meeting',
    description:
      'A Next.js-based agent that listens to Microsoft Teams meetings, transcribes audio using OpenAI’s Whisper, and generates structured meeting minutes with Google Gemini. The system integrates Microsoft Graph API for meeting access and automates the entire workflow from audio capture to final summary.',
    type: 'web',
    techStack: [
      'Next.js',
      'TypeScript',
      'Tailwind CSS',
      'Microsoft Graph API',
      'OpenAI Whisper',
      'Google Gemini',
    ],
    status: 'ongoing',
    semester: 'B/2025',
    manager: 'Nguyen Gia Khang',
    members: [
      {
        name: 'Nguyen Gia Khang',
        role: 'Leader, Developer',
      },
      {
        name: 'Nguyen Nghia Hiep',
        role: 'Tester',
      },
      {
        name: 'Pham Hoang Duong',
        role: 'Developer',
      },
      {
        name: 'Nguyen An Nhien',
        role: 'Developer',
      },
    ],
    purpose:
      'The purpose of this project is to explore the integration of cutting-edge AI tools and APIs to automate meeting documentation. By combining Next.js for the interface, Microsoft Graph API for Teams integration, Whisper for transcription, and Gemini for natural language generation, the project provides members with experience in building intelligent productivity tools that enhance collaboration and efficiency in real-world workflows.',
  },
  {
    name: 'Neo Rust App',
    description:
      'A console-based application in Rust for managing a library’s operations, such as adding, borrowing, returning, and tracking books.',
    type: 'software',
    techStack: ['Rust'],
    status: 'completed',
    semester: 'B/2025',
    manager: 'Nguyen Nghia Hiep',
    members: [
      {
        name: 'Nguyen Nghia Hiep',
        role: 'Leader, Tester',
      },
      {
        name: 'Nguyen Ngoc Luong',
        role: 'Developer',
      },
      {
        name: 'Tran Vinh Trong',
        role: 'Developer',
      },
    ],
    purpose:
      'The purpose of this project is to help members learn Rust fundamentals, including ownership, borrowing, error handling, and data management, while building a practical system that simulates real-world library operations.',
    githubUrl: 'https://github.com/rmit-nct/neo-rust-library',
  },
  {
    name: 'Neo Coffee App',
    description:
      'A console-based application in C++ for managing a coffee store’s operations, including adding, updating, viewing, and deleting menu items or sales records.',
    type: 'software',
    techStack: ['C++'],
    status: 'completed',
    semester: 'B/2025',
    manager: 'Pham Van Thanh Dat',
    members: [
      {
        name: 'Pham Van Thanh Dat',
        role: 'Leader, Developer',
      },
      {
        name: 'Pham Le Hoang Phu',
        role: 'Developer',
      },
      {
        name: 'Nguyen Ngoc Hiep',
        role: 'Developer',
      },
      {
        name: 'Dang Minh Tam',
        role: 'Developer',
      },
    ],
    purpose:
      'The purpose of this project is to help members apply core C++ concepts such as file handling, data structures, and object-oriented programming while simulating real-world store management tasks.',
    githubUrl: 'https://github.com/rmit-nct/neo-coffee-app-console',
  },
  {
    name: 'Neo What Weather',
    description:
      'A weather forecast website using React, TypeScript, Tailwind CSS, and a Weather API to display real-time weather updates.',
    type: 'web',
    techStack: ['React', 'TypeScript', 'Tailwind CSS', 'OpenWeather API'],
    status: 'completed',
    semester: 'B/2025',
    manager: 'Vo Minh Khoi',
    members: [
      {
        name: 'Vo Minh Khoi',
        role: 'Leader, Developer',
      },
      {
        name: 'Nguyen Van Hoang Tri',
        role: 'Developer',
      },
      {
        name: 'Huynh Tan Phuc',
        role: 'Developer',
      },
      {
        name: 'Pham Minh Dat',
        role: 'Developer',
      },
      {
        name: 'Dao Tien Dung',
        role: 'Developer',
      },
    ],
    purpose:
      'The purpose of this project is to provide our club members with hands-on experience in modern web development by building a weather forecast website using React, TypeScript, Tailwind CSS, and an external Weather API. Through this project, members will strengthen their understanding of component-based architecture, type safety, and responsive design, while also learning how to integrate third-party APIs into real-world applications. Beyond technical skills, the project encourages collaboration, problem-solving, and best practices in front-end development, preparing members for more advanced projects and professional opportunities.',
    githubUrl: 'https://github.com/rmit-nct/neo-what-weather',
  },
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
      'The purpose of this project is to develop a console-based storage management system using C++. This project aims to help members strengthen their understanding of fundamental programming concepts such as file handling, data structures, object-oriented programming, and memory management. By simulating real-world storage operations (such as adding, updating, searching, and deleting records), the project will provide practical experience in designing efficient algorithms, structuring code for scalability, and improving problem-solving skills in a low-level programming environment.',
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
    modelFile: '/media/glbmodel/three-dude-one-car.glb',
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
