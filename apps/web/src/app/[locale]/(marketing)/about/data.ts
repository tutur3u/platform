export type DepartmentName =
  | 'FinLog'
  | 'Technology'
  | 'Human Resources'
  | 'Marketing'
  | 'Executive Board';

export type CoreDepartmentName = Extract<
  DepartmentName,
  'Technology' | 'Human Resources' | 'Marketing'
>;

export interface DepartmentData {
  name: DepartmentName;
  bio: string;
  characteristics: {
    bio: string;
    badges: string[];
    quote: string;
    image: string;
  };
  activities: {
    bio: string;
    items: {
      title: string;
      description: string;
    }[];
    images: string[];
  };
}

export const timelineData: {
  year: string;
  title: string;
  description: string;
}[] = [
  {
    year: '2020',
    title: 'The Vision',
    description:
      'A group of passionate RMIT students identified the need for a dedicated tech community within SSET. Late-night coding sessions and shared dreams of innovation sparked the idea that would become NEO Culture Tech.',
  },
  {
    year: '2021',
    title: 'The Foundation',
    description:
      'NEO Culture Tech was officially established! Starting with just 15 founding members, we held our first workshop on web development and created our initial organizational structure with a focus on hands-on learning.',
  },
  {
    year: '2022',
    title: 'Building Our Structure',
    description:
      'We formalized our four core departments: Technology, Marketing, Human Resources, and Finance. Launched weekly tech talks, our first hackathon, and grew to over 50 active members across SSET.',
  },
  {
    year: '2023',
    title: 'Growing Our Impact',
    description:
      'Expanded beyond RMIT with industry partnerships and guest speaker series. Hosted our signature annual hackathon, introduced mentorship programs, and celebrated our 40th member milestone.',
  },
  {
    year: '2024',
    title: 'Restructuring for Growth',
    description:
      'Completely reconstructed our club management with a new organizational system. Implemented modern governance structures, streamlined operations across all departments, and established clear leadership pathways to support our evolving community.',
  },
  {
    year: '2025',
    title: 'NEO League Success',
    description:
      "Made history with NEO League - Prompt the Future 2025, our first competition! This groundbreaking event attracted over 170 competitors, showcasing our growth from a small club to a major force in Vietnam's tech competition scene.",
  },
];

export const members: {
  name: string;
  role: string;
  departments: DepartmentName[];
  image: string;
  bio: string;
  quote: string;
  generation: number;
  socials: {
    facebook?: string;
    linkedin?: string;
  };
}[] = [
  {
    name: 'Pham Ngoc Thien Kim',
    role: 'CFO',
    departments: ['Executive Board', 'FinLog'],
    image: '/members/gen7/kim.png',
    bio: 'Financial strategist with a passion for sustainable growth and fiscal responsibility. Kim ensures our club operates efficiently while investing in innovative projects that benefit our members.',
    quote: 'The best way to predict the future is to create it.',
    generation: 7,
    socials: {
      facebook: 'https://www.facebook.com/share/1A1d7YDkBA/?mibextid=wwXIfr',
      linkedin: 'https://www.linkedin.com/in/carolpham14042006',
    },
  },
  {
    name: 'Nguyen Ha Gia Tam',
    role: 'Head of HR & Liaison Officer',
    departments: ['Executive Board', 'Human Resources'],
    image: '/members/gen7/tam.png',
    bio: 'People-focused leader dedicated to building inclusive communities and fostering personal growth. Tam creates opportunities for members to develop both technical and soft skills.',
    quote: 'People first, technology second.',
    generation: 7,
    socials: {
      facebook: 'https://www.facebook.com/giatam.nguyen.39/',
      linkedin: 'https://www.linkedin.com/in/gia-tâm-nguyễn-hà-bb435429a',
    },
  },
  {
    name: 'Huynh Hoang Duc',
    role: 'President',
    departments: ['Executive Board', 'Technology'],
    image: '/members/gen7/duc.png',
    bio: 'Visionary leader bridging technology and community. Duc drives our strategic direction while maintaining our core values of innovation, collaboration, and excellence in everything we do.',
    quote: 'Your work is going to fill a large part of your life.',
    generation: 7,
    socials: {
      facebook: 'https://www.facebook.com/hhoangduc12',
      linkedin: 'https://www.linkedin.com/in/hhoang-duc',
    },
  },
  {
    name: 'Vo Tran Minh Nhat',
    role: 'Head of Marcom',
    departments: ['Executive Board', 'Marketing'],
    image: '/members/gen7/nhat.png',
    bio: 'Creative storyteller and brand strategist who amplifies our voice in the tech community. Nhat crafts compelling narratives that showcase our impact and attract like-minded innovators.',
    quote: 'Strive not to be a success, but rather to be of value.',
    generation: 7,
    socials: {
      facebook: 'https://www.facebook.com/votrnminhn',
      linkedin: 'https://www.linkedin.com/in/sun-vo/',
    },
  },
  {
    name: 'Huynh Thai Duong',
    role: 'Hardware Manager',
    departments: ['Technology'],
    image: '/members/gen7/duong.png',
    bio: 'Hardware enthusiast and Embedded specialist who brings ideas to life through circuits and code. Duong leads our hardware projects and workshops, from Arduino basics to advanced robotics.',
    quote: 'The only way to do great work is to love what you do.',
    generation: 7,
    socials: {
      facebook: 'https://www.facebook.com/ht.kurt.12/',
      linkedin: 'https://www.linkedin.com/in/huỳnh-thái-dương-4aa58824a',
    },
  },
  {
    name: 'Ngo Van Tai',
    role: 'Head of Technology',
    departments: ['Executive Board', 'Technology'],
    image: '/members/gen7/tai.png',
    bio: 'Technology department leader with expertise in both software and hardware domains. Tai manages and navigates the entire tech department, bridging development teams and ensuring seamless integration across all technical initiatives.',
    quote: 'The journey of a thousand miles begins with a single step.',
    generation: 7,
    socials: {
      facebook: 'https://www.facebook.com/van.tai.461142/',
      linkedin: 'https://www.linkedin.com/in/taivanngo',
    },
  },
  {
    name: 'Mai Dang Khoa',
    role: 'Software Manager',
    departments: ['Technology'],
    image: '/members/gen7/khoa.png',
    bio: 'Software architect and algorithm enthusiast who transforms complex problems into elegant solutions. Khoa leads our development teams and champions best practices in modern software engineering.',
    quote: 'Code is poetry written for machines but read by humans.',
    generation: 7,
    socials: {
      facebook: 'https://www.facebook.com/kyle.mai261/',
      linkedin: 'https://www.linkedin.com/in/kylemai261',
    },
  },
  // Generation 6
  {
    name: 'Vo Khanh Quynh',
    role: 'Head of HR & Liaison Officer',
    departments: ['Executive Board', 'Human Resources'],
    image: '/members/gen6/quynh.png',
    bio: 'Former HR leader who established the foundation of our people-centric culture. Quynh pioneered inclusive recruitment practices and created the mentorship programs that continue to develop our members today.',
    quote: 'Great leaders create more leaders, not followers.',
    generation: 6,
    socials: {
      facebook: 'https://www.facebook.com/vo.khanh.quynh.880939',
      linkedin: 'https://www.linkedin.com/in/vokhanhquynh/',
    },
  },
  {
    name: 'Cao Viet Quang',
    role: 'President',
    departments: ['Executive Board', 'Technology'],
    image: '/members/gen6/quang.png',
    bio: 'Visionary former president who transformed NEO into a recognized force in tech community. Quang led the strategic initiatives that positioned our club as a leader in innovation and collaboration.',
    quote:
      "Innovation is not about saying yes to everything. It's about saying no to all but the most crucial features.",
    generation: 6,
    socials: {
      facebook: 'https://www.facebook.com/vietquang.cao.2024',
      linkedin: 'https://www.linkedin.com/in/vietquang-cao-8a1307223/',
    },
  },
  {
    name: 'Vo Hoang Phuc',
    role: 'Technical Vice President',
    departments: ['Executive Board', 'Technology'],
    image: '/members/gen6/phuc.png',
    bio: 'Founding architect of NCT Hub who transformed a simple vision into the thriving tech community we know today. His pioneering work established the robust systems and innovative mindset that continue to drive our success.',
    quote: 'The best way to predict the future is to invent it.',
    generation: 6,
    socials: {
      facebook: 'https://www.facebook.com/vohoangphucc',
      linkedin: 'https://www.linkedin.com/in/vohoangphuc/',
    },
  },
  {
    name: 'Huynh Tan Phat',
    role: 'CFO',
    departments: ['Executive Board', 'FinLog'],
    image: '/members/gen6/phat.png',
    bio: "Former financial leader who implemented transparent budgeting systems and secured funding for major initiatives. Phat's financial stewardship enabled sustainable growth and long-term investment in our community.",
    quote:
      'Financial wisdom is not about how much you make, but how wisely you manage what you have.',
    generation: 6,
    socials: {
      facebook: 'https://www.facebook.com/phat.huynh.606420',
      linkedin: 'https://www.linkedin.com/in/phathuynh221/',
    },
  },
  {
    name: 'Huynh Hoang Duc',
    role: 'Head of Technology',
    departments: ['Technology'],
    image: '/members/gen6/duc.png',
    bio: 'Former technology leader who spearheaded our first major technical projects and workshops. Duc fostered a culture of continuous learning and technical excellence that inspired countless members to pursue careers in technology.',
    quote: 'Technology is best when it brings people together.',
    generation: 6,
    socials: {
      facebook: 'https://www.facebook.com/hhoangduc12',
      linkedin: 'https://www.linkedin.com/in/hhoang-duc',
    },
  },
  {
    name: 'Dao Ngoc Khanh',
    role: 'Head of Marcom',
    departments: ['Marketing'],
    image: '/members/gen6/khanh.png',
    bio: "Former marketing leader who built NEO's brand identity and established our voice in the tech community. Khanh created compelling campaigns that attracted top talent and positioned us as innovators in tech education.",
    quote:
      'Marketing is no longer about the stuff you make, but the stories you tell.',
    generation: 6,
    socials: {
      facebook: 'https://www.facebook.com/kelly.candylovely',
      linkedin: 'https://www.linkedin.com/in/ngoc-khanh-dao-250693207/',
    },
  },
];

export const departments: DepartmentData[] = [
  {
    name: 'Technology',
    bio: 'The Technology department serves as the core technical engine of our organization, overseeing all software and hardware initiatives. We are dedicated to cultivating a rigorous and collaborative environment tailored for passionate technology enthusiasts and SSET students alike.',
    characteristics: {
      bio: 'Develop tools for member use',
      badges: [
        'Creative',
        'Passionate in Technology',
        'Strive for improvement',
        'Collaborative',
        'Work Hard, Play Harder',
      ],
      quote:
        'Technology at NEO is not only about building things well, but also about learning fast, sharing openly, and turning ideas into something people can actually use.',
      image: '/departments/technology/competitive-programming-workshop.jpg',
    },
    activities: {
      bio: 'What Technology does and no one else can do the same way.',
      items: [
        {
          title: 'Project Development',
          description:
            'We turn club ideas into working products, from planning flows and building features to testing demos that members can present with confidence.',
        },
        {
          title: 'Technical Workshops',
          description:
            'Hands-on sessions help members explore frameworks, hardware, and problem solving through guided practice instead of passive theory.',
        },
        {
          title: 'Product Pitching',
          description:
            'We prepare teams to explain what they build, why it matters, and how a technical concept becomes a clear, compelling solution.',
        },
      ],
      images: [
        '/departments/technology/nextjs-workshop.jpg',
        '/departments/technology/soldering-workshop.jpg',
        '/departments/technology/soldering-workshop-2.jpg',
        '/departments/technology/competitive-programming-workshop-2.jpg',
      ],
    },
  },
  {
    name: 'Human Resources',
    bio: 'The Human Resources department focuses on building a strong, inclusive community within the club. They organize team-building activities, provide support for members, and ensure a positive environment for everyone.',
    characteristics: {
      bio: 'Connect & Support members',
      badges: [
        'Recruitment & Onboarding',
        'Operations',
        'Event Management',
        'Engagement',
        'System & Data Management',
        'Corporate Culture',
        'Risk Management',
        'Conflict Resolution',
      ],
      quote:
        'Human Resources keeps the club human first by shaping the member experience, sustaining culture, and making sure every person feels they belong here.',
      image: '/departments/human-resources/secret-santa-c-2025.jpg',
    },
    activities: {
      bio: 'What Human Resources does and no one else can do the same way.',
      items: [
        {
          title: 'Recruitment',
          description:
            'We design welcoming recruitment journeys, coordinate interviews, and help new members step into the club with clarity and confidence.',
        },
        {
          title: 'Event Management',
          description:
            'From internal operations to club-wide experiences, we organize the people side of events so every activity runs smoothly and feels intentional.',
        },
        {
          title: 'Bonding Days',
          description:
            'We create moments that bring members closer, strengthen trust across teams, and turn a student club into a community people genuinely enjoy being part of.',
        },
      ],
      images: [
        '/departments/human-resources/bonding-trip-2025c.jpeg',
        '/departments/human-resources/welcome-day-c-2025.jpg',
        '/departments/human-resources/neo-award-2025c.jpg',
        '/departments/human-resources/sportday-2025c.jpeg',
      ],
    },
  },
  {
    name: 'Marketing',
    bio: 'The Marketing department is responsible for promoting the club and its events to the wider community. They handle branding, communications, and outreach initiatives.',
    characteristics: {
      bio: 'The face of NEO to the outside world',
      badges: [
        'Strategic',
        'Creative',
        'Promotional',
        'Branding',
        'Visualization',
        'Collaborative',
        'External Relations',
        'Keo 502',
      ],
      quote:
        'Marketing gives NEO a recognizable face by turning club energy into visuals, messages, and campaigns that people immediately remember.',
      image: '/departments/marketing/nct-fanpage.png',
    },
    activities: {
      bio: 'What Marketing does and no one else can do the same way.',
      items: [
        {
          title: 'Design Production',
          description:
            'We create booth concepts, uniforms, and event visuals that give every campaign a polished look members can instantly recognize.',
        },
        {
          title: 'Brand Building',
          description:
            "We shape the club's visual identity, refine how NEO appears to students, and make sure every touchpoint feels consistent and memorable.",
        },
        {
          title: 'Social Media Content',
          description:
            'We turn activities into stories through posts and creative assets that keep the community updated, engaged, and excited to join in.',
        },
      ],
      images: [
        '/departments/marketing/logo-2026a.png',
        '/departments/marketing/club-day-2025c.png',
        '/departments/marketing/linkedin-posts.png',
        '/departments/marketing/souvenirs.png',
      ],
    },
  },
];
