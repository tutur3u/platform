export type DepartmentName =
  | 'FinLog'
  | 'Technology'
  | 'Human Resources'
  | 'Marketing'
  | 'Executive Board';

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
