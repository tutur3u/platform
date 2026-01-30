export interface TeamMember {
  name: string;
  role: string;
  avatar?: string;
  isNctMember?: boolean;
}

export interface Achievement {
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
    name: 'Excel Leader Award 2025',
    achievement: '🏆 Excel Leader',
    image: '/hall-of-fames/excel-leader.jpg',
    teamMembers: [
      {
        name: 'Ngo Van Tai',
        role: 'Head of Technology',
        avatar: '/members/gen7/tai.png',
        isNctMember: true,
      },
    ],
    achievementDescription:
      "The Excel Leader Award recognizes student club leaders who successfully balance academic excellence (GPA ≥ 3.5) with strong co-curricular engagement and leadership contributions. Tai has consistently demonstrated the ability to excel academically while effectively managing his responsibilities as a club leader. His contributions to organizing and running multiple events and workshops have significantly strengthened the club's activities and impact. Through his dedication, teamwork, and reliability, Tai has become a key pillar of the club's success.",
    year: 2025,
    category: 'Award',
  },
  {
    name: 'NAVER Vietnam AI Hackathon 2025',
    achievement: '🥉 Second Runner Up (NAVER Award)',
    image: '/hall-of-fames/naver.jpg',
    teamMembers: [
      {
        name: 'Huynh Thai Duong',
        role: 'Developer',
        avatar: '/members/gen7/duong.png',
        isNctMember: true,
      },
      {
        name: 'Truong Van Dat',
        role: 'Developer',
      },
      {
        name: 'Uyen Pham',
        role: 'Developer',
      },
    ],
    achievementDescription:
      'Competed against 2000+ participants in the NAVER Vietnam AI Hackathon 2025, an online program for Vietnamese students to build practical AI service prototypes on NAVER infrastructure. In just 2 weeks, our team built a mobile/web prototype using NAVER AI APIs, advancing to the Final Pitching & Award Ceremony where the top 5 teams presented their projects. Our solution was evaluated on implementation, creativity, impact, and relevance.',
    year: 2025,
    category: 'Hackathon',
  },

  {
    name: 'Katalon x RMIT Testathon',
    achievement: 'Top 5 Finisher',
    image: '/hall-of-fames/testathon.jpeg',
    teamMembers: [
      {
        name: 'Ngo Van Tai',
        role: 'Tester',
        avatar: '/members/gen7/tai.png',
        isNctMember: true,
      },
      {
        name: 'Huynh Thai Duong',
        role: 'Tester',
        avatar: '/members/gen7/duong.png',
        isNctMember: true,
      },
      {
        name: 'Huynh Tan Phat',
        role: 'Tester',
        avatar: '/members/gen6/phat.png',
        isNctMember: true,
      },
    ],
    achievementDescription:
      'Secured a top 5 position during the intensive Katalon x RMIT Testathon. In just 5 hours, we rigorously tested a full-stack application by applying a comprehensive testing strategy. By leveraging manual testing, Katalon, and Postman, we uncovered 40 bugs. Our analysis used black-box, white-box, and experience-based techniques to identify a wide spectrum of issues, including critical security flaws.',
    year: 2025,
    category: 'Contest',
  },
  {
    name: 'RMIT Hack-A-Venture 2024',
    achievement: '🏆 Champion',
    image: '/hall-of-fames/hackaventure2024.jpeg',
    teamName: 'YourSDGSolver',
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
];
