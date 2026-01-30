export interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar?: string;
  isNctMember?: boolean;
}

export interface Achievement {
  id: string;
  competitionName: string;
  achievement: string;
  teamName: string;
  image: string;
  teamMembers: TeamMember[];
  achievementDescription: string;
  eventLink: string;
  year: number;
  category: 'Hackathon' | 'Competition' | 'Contest' | 'Tournament';
}

export const achievements: Achievement[] = [
  {
    id: '1',
    competitionName: 'Bosch Code Race 2025',
    achievement: '2nd Runner-Up',
    teamName: 'The LIEMS',
    image: '/hall-of-fames/coderace.jpg',
    teamMembers: [
      {
        id: '1',
        name: 'Ngo Van Tai',
        role: 'Embedded Developer',
        avatar: '/members/gen7/tai.png',
        isNctMember: true,
      },
      {
        id: '2',
        name: 'Huynh Thai Duong',
        role: 'Embedded Developer',
        avatar: '/members/gen7/duong.png',
        isNctMember: true,
      },
      {
        id: '3',
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
    competitionName: 'Global Hackathon Series',
    achievement: '🥈 Second Place',
    teamName: 'Innovation Hub',
    image: '/android-chrome-512x512.png',
    teamMembers: [
      {
        id: '5',
        name: 'David Park',
        role: 'Project Manager',
        avatar: '/android-chrome-512x512.png',
      },
      {
        id: '6',
        name: 'Luna Zhang',
        role: 'Data Scientist',
        avatar: '/android-chrome-512x512.png',
      },
      {
        id: '7',
        name: 'James Wilson',
        role: 'Mobile Developer',
        avatar: '/android-chrome-512x512.png',
      },
    ],
    achievementDescription:
      'Created a sustainable transportation app that connects commuters with eco-friendly travel options. The app uses real-time data to optimize routes and reduce carbon footprint while saving users money on their daily commute.',
    eventLink: 'https://globalhackathon.com/2024',
    year: 2024,
    category: 'Hackathon',
  },
  {
    id: '3',
    competitionName: 'University Programming Contest',
    achievement: '🥉 Third Place',
    teamName: 'Algorithm Aces',
    image: '/android-chrome-512x512.png',
    teamMembers: [
      {
        id: '8',
        name: 'Rachel Green',
        role: 'Algorithm Expert',
        avatar: '/android-chrome-512x512.png',
      },
      {
        id: '9',
        name: 'Thomas Anderson',
        role: 'Systems Architect',
        avatar: '/android-chrome-512x512.png',
      },
      {
        id: '10',
        name: 'Maya Patel',
        role: 'Quality Assurance',
        avatar: '/android-chrome-512x512.png',
      },
    ],
    achievementDescription:
      'Solved complex algorithmic challenges in competitive programming, demonstrating exceptional problem-solving skills and mathematical thinking. Our solutions were optimized for both time and space complexity.',
    eventLink: 'https://universitycontest.edu/2024',
    year: 2024,
    category: 'Contest',
  },
  {
    id: '4',
    competitionName: 'Tech Innovation Awards',
    achievement: '🏆 Best Innovation',
    teamName: 'Future Builders',
    image: '/android-chrome-512x512.png',
    teamMembers: [
      {
        id: '11',
        name: 'Kevin Lee',
        role: 'Tech Lead',
        avatar: '/android-chrome-512x512.png',
      },
      {
        id: '12',
        name: 'Isabella Martinez',
        role: 'Product Designer',
        avatar: '/android-chrome-512x512.png',
      },
      {
        id: '13',
        name: 'Ryan Cooper',
        role: 'DevOps Engineer',
        avatar: '/android-chrome-512x512.png',
      },
      {
        id: '14',
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
    competitionName: 'AI Challenge Summit',
    achievement: '🎯 Most Creative Solution',
    teamName: 'Neural Networks',
    image: '/android-chrome-512x512.png',
    teamMembers: [
      {
        id: '15',
        name: 'Oliver Smith',
        role: 'AI Engineer',
        avatar: '/android-chrome-512x512.png',
      },
      {
        id: '16',
        name: 'Sophie Turner',
        role: 'Machine Learning Specialist',
        avatar: '/android-chrome-512x512.png',
      },
      {
        id: '17',
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
    competitionName: 'Open Source Championship',
    achievement: '⭐ Community Choice',
    teamName: 'Open Innovators',
    image: '/android-chrome-512x512.png',
    teamMembers: [
      {
        id: '18',
        name: 'Aria Johnson',
        role: 'Open Source Maintainer',
        avatar: '/android-chrome-512x512.png',
      },
      {
        id: '19',
        name: 'Lucas Brown',
        role: 'Community Manager',
        avatar: '/android-chrome-512x512.png',
      },
      {
        id: '20',
        name: 'Mia Davis',
        role: 'Documentation Lead',
        avatar: '/android-chrome-512x512.png',
      },
      {
        id: '21',
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
