export interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatar?: string;
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
    competitionName: 'International Coding Championship 2024',
    achievement: '🥇 First Place',
    teamName: 'Code Crusaders',
    image: '/android-chrome-512x512.png',
    teamMembers: [
      {
        id: '1',
        name: 'Alex Chen',
        role: 'Team Lead & Full-stack Developer',
        avatar: '/android-chrome-512x512.png',
      },
      {
        id: '2',
        name: 'Sarah Kim',
        role: 'Frontend Specialist',
        avatar: '/android-chrome-512x512.png',
      },
      {
        id: '3',
        name: 'Marcus Johnson',
        role: 'Backend Engineer',
        avatar: '/android-chrome-512x512.png',
      },
      {
        id: '4',
        name: 'Emily Rodriguez',
        role: 'UI/UX Designer',
        avatar: '/android-chrome-512x512.png',
      },
    ],
    achievementDescription:
      'Our team developed an innovative AI-powered code review system that revolutionizes the way developers collaborate. The solution uses machine learning to provide intelligent suggestions and automatically detects potential bugs before they reach production.',
    eventLink: 'https://codingchampionship.org/2024',
    year: 2024,
    category: 'Competition',
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
