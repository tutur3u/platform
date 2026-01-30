export interface TeamMember {
  name: string;
  role: string;
  avatar?: string;
  isNctMember?: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  achievement: string;
  teamName?: string;
  image: string;
  teamMembers: TeamMember[];
  achievementDescription: string;
  eventLink?: string;
  year: number;
  category: 'Hackathon' | 'Competition' | 'Contest' | 'Tournament' | 'Award';
}

export const achievements: Achievement[] = [
  {
    id: '1',
    name: 'Bosch CodeRace 2025',
    achievement: '2nd Runner-Up',
    teamName: 'The LIEMS',
    image: '/hall-of-fames/coderace.jpg',
    teamMembers: [
      {
        name: 'Ngo Van Tai',
        role: 'Embedded Developer',
        avatar: '/members/gen7/tai.png',
        isNctMember: true,
      },
      {
        name: 'Huynh Thai Duong',
        role: 'Embedded Developer',
        avatar: '/members/gen7/duong.png',
        isNctMember: true,
      },
      {
        name: 'Le Nguyen Khuong Duy',
        role: 'Embedded Developer',
        isNctMember: false,
      },
    ],
    achievementDescription:
      'In just 72 hours, our team built the Intelligent Mountain Pass Safety Assist System (IMPSAS) - an autonomous driving solution designed to prevent accidents on dangerous mountain roads. Despite having no prior experience with CAN bus or autonomous systems, we learned rapidly and delivered a working system that monitors brake integrity, detects hazards in blind spots, and warns drivers about slippery conditions. The hackathon tested our adaptability, teamwork, and ability to bridge the gap between simulation and real-world vehicle integration.',
    eventLink:
      'https://www.rmit.edu.vn/students/student-news-and-events/student-news/2025/rmit-students-build-safety-system-in-72-hours',
    year: 2025,
    category: 'Hackathon',
  },
  {
    id: '2',
    name: "2025 SSET Dean's List Award",
    achievement: '🎓 Academic Excellence',
    image: '/hall-of-fames/dean-list.jpg',
    teamMembers: [
      {
        name: 'Huynh Hoang Duc',
        role: 'Robotics and Mechatronics Year 3',
        avatar: '/members/gen7/duc.png',
        isNctMember: true,
      },
      {
        name: 'Ngo Van Tai',
        role: 'Software Engineering Year 3',
        avatar: '/members/gen7/tai.png',
        isNctMember: true,
      },
      {
        name: 'Pham Van Thanh Dat',
        role: 'Software Engineering Year 1',
        isNctMember: true,
      },
      {
        name: 'Luu Quoc Phap',
        role: 'Information Technology Year 1',
        isNctMember: true,
      },
      {
        name: 'Lisa',
        role: 'Robotics and Mechatronics Year 1',
        isNctMember: true,
      },
    ],
    achievementDescription:
      "Neo Culture Tech is incredibly proud to celebrate five of our brilliant members who have been selected for the 2025 SSET Dean's List Award! This prestigious award from the School of Science, Engineering & Technology (SSET) recognizes their outstanding academic performance, relentless dedication, and hard work. Leading and contributing to Neo while balancing demanding club responsibilities, technical projects, and top-tier academics is incredibly impressive.",
    year: 2025,
    category: 'Award',
  },
  {
    id: '3',
    name: 'RMIT Hack-A-Venture 2024',
    achievement: '🏆 Champion',
    image: '/hall-of-fames/hackaventure2024.jpeg',
    teamMembers: [
      {
        name: 'Ngo Van Tai',
        role: 'Full-Stack Developer',
        avatar: '/members/gen7/tai.png',
        isNctMember: true,
      },
      {
        name: 'Le Nguyen Khuong Duy',
        role: 'Full-Stack Developer',
      },
      {
        name: 'Nhan Nguyen',
        role: 'Full-Stack Developer',
      },
      {
        name: 'Thuy Nguyen',
        role: 'Business Strategy & Pitch',
      },
    ],
    achievementDescription:
      'Awarded Champion of RMIT Hack-A-Venture 2024, a 24-hour hackathon, for our innovative Cashew Carbon Credits Platform. The platform empowers cashew farmers to earn additional income by selling carbon credits while helping buyers offset their carbon footprint. Our team developed a blockchain-based solution that ensures both technical feasibility and real-world impact, supporting sustainability through innovative technology.',
    year: 2025,
    category: 'Competition',
  },
  {
    id: '4',
    name: 'Tech Innovation Awards',
    achievement: '🏆 Best Innovation',
    teamName: 'Future Builders',
    image: '/android-chrome-512x512.png',
    teamMembers: [
      {
        name: 'Kevin Lee',
        role: 'Tech Lead',
        avatar: '/android-chrome-512x512.png',
      },
      {
        name: 'Isabella Martinez',
        role: 'Product Designer',
        avatar: '/android-chrome-512x512.png',
      },
      {
        name: 'Ryan Cooper',
        role: 'DevOps Engineer',
        avatar: '/android-chrome-512x512.png',
      },
      {
        name: 'Zoe Adams',
        role: 'Research Analyst',
        avatar: '/android-chrome-512x512.png',
      },
    ],
    achievementDescription:
      'Developed a groundbreaking blockchain-based supply chain management system that provides complete transparency and traceability for agricultural products, helping consumers make informed choices about their food.',
    eventLink: 'https://techinnovationawards.org/2024',
    year: 2024,
    category: 'Competition',
  },
  {
    id: '5',
    name: 'AI Challenge Summit',
    achievement: '🎯 Most Creative Solution',
    teamName: 'Neural Networks',
    image: '/android-chrome-512x512.png',
    teamMembers: [
      {
        name: 'Oliver Smith',
        role: 'AI Engineer',
        avatar: '/android-chrome-512x512.png',
      },
      {
        name: 'Sophie Turner',
        role: 'Machine Learning Specialist',
        avatar: '/android-chrome-512x512.png',
      },
      {
        name: 'Diego Santos',
        role: 'Data Engineer',
        avatar: '/android-chrome-512x512.png',
      },
    ],
    achievementDescription:
      'Built an AI-powered personal assistant that learns from user behavior to provide personalized recommendations for daily tasks, entertainment, and productivity improvements. The solution uses advanced natural language processing and behavioral analysis.',
    eventLink: 'https://aichallenge.ai/summit2024',
    year: 2024,
    category: 'Tournament',
  },
  {
    id: '6',
    name: 'Open Source Championship',
    achievement: '⭐ Community Choice',
    teamName: 'Open Innovators',
    image: '/android-chrome-512x512.png',
    teamMembers: [
      {
        name: 'Aria Johnson',
        role: 'Open Source Maintainer',
        avatar: '/android-chrome-512x512.png',
      },
      {
        name: 'Lucas Brown',
        role: 'Community Manager',
        avatar: '/android-chrome-512x512.png',
      },
      {
        name: 'Mia Davis',
        role: 'Documentation Lead',
        avatar: '/android-chrome-512x512.png',
      },
      {
        name: 'Ethan Wilson',
        role: 'Security Expert',
        avatar: '/android-chrome-512x512.png',
      },
    ],
    achievementDescription:
      'Created an open-source developer tool that simplifies the process of contributing to large codebases. The tool provides automated testing, code formatting, and integration workflows that have been adopted by over 50 open source projects.',
    eventLink: 'https://opensourcechampionship.org/2024',
    year: 2024,
    category: 'Competition',
  },
];
