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
    name: 'RMIT Hack-A-Venture 2025',
    achievement: '🏆 Champion',
    teamName: 'Aquaholics In Paris',
    image: '/hall-of-fames/hackaventure2025.jpg',
    teamMembers: [
      {
        name: 'Nguyễn Quốc Khánh',
        role: 'Leader',
        isNctMember: true,
      },
      {
        name: 'Trần Hoàng Minh',
        role: 'Software Lead',
        isNctMember: true,
      },
      {
        name: 'Trần Nhật Tiến',
        role: 'Developer',
        isNctMember: true,
      },
      {
        name: 'Nguyễn Đôn Gia Phát',
        role: 'Developer',
        isNctMember: true,
      },
    ],
    achievementDescription: `We achieve first place, which wasn't in our plan, it was totally an unexpectation. At first we were frustrated since this is the first time we've ever built an MVP, developt a strategic business plan from scratch with no prior experience since we are 4 Software Engineer majored students. During the hardship, there are friends that stood by our sides to help us get through the difficult times, it was truly amazing.`,
    year: 2026,
    category: 'Hackathon',
  },
  {
    name: 'Cybersecurity Student Contest Vietnam 2025 (CSCV 2025)',
    achievement: 'Top 20 National',
    teamName: '0XEPLOIT',
    image: '/hall-of-fames/cscv.jpeg',
    teamMembers: [
      {
        name: 'Tri Duong Minh',
        role: 'Member',
        isNctMember: true,
      },
      {
        name: 'Nguyen Nghia Hiep',
        role: 'Member',
        isNctMember: true,
      },
      {
        name: 'Nguyen An Nhien',
        role: 'Member',
        isNctMember: true,
      },
      {
        name: 'Dao Ngoc Huy',
        role: 'Member',
        isNctMember: false,
      },
    ],
    achievementDescription:
      'In 2025, my team, 0XEPLOIT, achieved a notable result at the Cybersecurity Student Contest Vietnam (CSCV), ranking 11th out of more than 300 teams from 317 institutions nationwide and internationally. Competing in the finals at the Ministry of Public Security’s A05 Cyber Arena in Hanoi, we faced intense Attack–Defense and Jeopardy-style CTF challenges across web exploitation, cryptography, binary exploitation, and digital forensics. Despite the high-pressure environment and experienced opponents, our team relied on strong collaboration, clear communication, and rapid problem-solving to perform effectively and secure a Top 20 national finish',
    eventLink: 'https://www.facebook.com/cscv.vn',
    year: 2025,
    category: 'Contest',
  },
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
    name: 'AI IN BUSINESS SEASON 2',
    achievement: '2nd Runner up',
    teamName: 'Xin Loi Vi Da Den',
    image: '/hall-of-fames/ai-in-business.jpeg',
    teamMembers: [
      {
        name: 'Pham Ngoc Thien Kim',
        role: 'Member',
        avatar: '/members/gen7/kim.png',
        isNctMember: true,
      },
      {
        name: 'Nguyen Dang Gia Dao',
        role: 'Member',
        isNctMember: false,
      },
      {
        name: 'Bui Khac Gia Dao',
        role: 'Member',
        isNctMember: false,
      },
      {
        name: 'Vu Thi Anh Thu',
        role: 'Member',
        isNctMember: false,
      },
    ],
    achievementDescription:
      'Competition Theme: Applied AI Technology for User Growth in E-commerce. Our team developed an AI-powered e-commerce landing page integrated with an intelligent chatbot to enhance customer experience and drive user growth. The chatbot provides real-time support, automatically answering customer inquiries, recommending relevant products, and guiding users through the purchasing journey. A key innovation is its ability to store and analyze customer interaction data, reducing repetitive communication and delivering a more personalized experience.',
    eventLink: 'https://www.facebook.com/share/1bQvHZxUeW/?mibextid=wwXIfr',
    year: 2025,
    category: 'Competition',
  },
  {
    name: 'The Next Analyst Challenge Season 1',
    achievement: 'Champion',
    teamName: 'The Analyst',
    image: '/hall-of-fames/next-analyst.jpeg',
    teamMembers: [
      {
        name: 'Pham Ngoc Thien Kim',
        role: 'Member',
        avatar: '/members/gen7/kim.png',
        isNctMember: true,
      },
    ],
    achievementDescription:
      'Tasked with uncovering insights from a complex dataset and proposing strategic business recommendations, our team took a visual-first approach—making data stories simple, clean, and impactful. The judges praised our visualization clarity and the depth of our insights. Winning Champion was a moment of pure joy and validation after months of dedicated effort.',
    eventLink: 'https://www.facebook.com/thenextanalystchallenge',
    year: 2025,
    category: 'Competition',
  },
  {
    name: 'CoverGo AI Hackathon 2025',
    achievement: 'Champion',
    teamName: 'RMIT x UIT',
    image: '/hall-of-fames/covergo-ai-hackathon.jpg',
    teamMembers: [
      {
        name: 'Khoa Mai Dang',
        role: 'Member',
        avatar: '/members/gen7/khoa.png',
        isNctMember: true,
      },
      {
        name: ' Dai Nguyen Ba',
        role: 'Member',
        isNctMember: false,
      },
      {
        name: 'Shirin Shujaa',
        role: 'Member',
        isNctMember: false,
      },
      {
        name: 'Thao Trinh',
        role: 'Member',
        isNctMember: false,
      },
    ],
    achievementDescription: '',
    eventLink:
      'https://www.facebook.com/groups/congdongsvuit/posts/1705153630393663/',
    year: 2025,
    category: 'Hackathon',
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
  {
    name: ' Sustainable Design Competition by Sustainable Textile Solution (STS)',
    achievement: '4R Design award',
    image: '/hall-of-fames/fashion_enterprise_program.jpg',
    teamMembers: [
      {
        name: 'Vo Tran Minh Nhat',
        role: 'Designer',
        avatar: '/members/gen7/nhat.png',
        isNctMember: true,
      },
      {
        name: 'Phung Hanh Ngan',
        role: 'Designer',
      },
      {
        name: 'Nguyen Phuong Binh',
        role: 'Designer',
      },
      {
        name: 'Mai Huynh Xuan Vy',
        role: 'Designer',
      },
    ],
    achievementDescription:
      'E-CLO competed with universities nationwide in a sustainable design challenge centered on material innovation and ethical product values. The project was awarded the Most Reality Award, receiving a 15 million VND prize.',
    year: 2024,
    category: 'Award',
  },
];
