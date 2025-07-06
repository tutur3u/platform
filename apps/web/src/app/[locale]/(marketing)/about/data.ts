export const members: {
  name: string;
  role: string;
  departments: (
    | 'Executive Board'
    | 'Technology'
    | 'Marketing'
    | 'Human Resources'
    | 'FinLog'
  )[];
  image: string;
  bio: string;
  quote: string;
  socials: {
    facebook: string;
    linkedin: string;
  };
}[] = [
  {
    name: 'Pham Ngoc Thien Kim',
    role: 'CFO',
    departments: ['Executive Board', 'FinLog'],
    image: '/members/kim.png',
    bio: 'Financial strategist with a passion for sustainable growth and fiscal responsibility. Kim ensures our club operates efficiently while investing in innovative projects that benefit our members.',
    quote: 'The best way to predict the future is to create it.',
    socials: {
      facebook: 'https://www.facebook.com/share/1A1d7YDkBA/?mibextid=wwXIfr',
      linkedin: 'https://www.linkedin.com/in/carolpham14042006',
    },
  },
  {
    name: 'Nguyen Ha Gia Tam',
    role: 'Head of HR & Liaison Officer',
    departments: ['Executive Board', 'Human Resources'],
    image: '/members/tam.png',
    bio: 'People-focused leader dedicated to building inclusive communities and fostering personal growth. Tam creates opportunities for members to develop both technical and soft skills.',
    quote: 'People first, technology second.',
    socials: {
      facebook: 'https://www.facebook.com/giatam.nguyen.39/',
      linkedin: 'https://www.linkedin.com/in/gia-tâm-nguyễn-hà-bb435429a',
    },
  },
  {
    name: 'Huynh Hoang Duc',
    role: 'President',
    departments: ['Executive Board', 'Technology'],
    image: '/members/duc.png',
    bio: 'Visionary leader bridging technology and community. Duc drives our strategic direction while maintaining our core values of innovation, collaboration, and excellence in everything we do.',
    quote: 'Your work is going to fill a large part of your life.',
    socials: {
      facebook: 'https://www.facebook.com/hhoangduc12',
      linkedin: 'https://www.linkedin.com/in/hhoang-duc',
    },
  },
  {
    name: 'Phung Khanh Minh',
    role: 'Head of Marcom',
    departments: ['Executive Board', 'Marketing'],
    image: '/members/minh.png',
    bio: 'Creative storyteller and brand strategist who amplifies our voice in the tech community. Minh crafts compelling narratives that showcase our impact and attract like-minded innovators.',
    quote: 'Strive not to be a success, but rather to be of value.',
    socials: {
      facebook: 'https://www.facebook.com/share/12MY7CjvZmb/?mibextid=wwXIfr',
      linkedin: '#',
    },
  },
  {
    name: 'Huynh Thai Duong',
    role: 'Hardware Manager',
    departments: ['Technology'],
    image: '/members/duong.png',
    bio: 'Hardware enthusiast and Embedded specialist who brings ideas to life through circuits and code. Duong leads our hardware projects and workshops, from Arduino basics to advanced robotics.',
    quote: 'The only way to do great work is to love what you do.',
    socials: {
      facebook: 'https://www.facebook.com/ht.kurt.12/',
      linkedin: 'https://www.linkedin.com/in/huỳnh-thái-dương-4aa58824a',
    },
  },
  {
    name: 'Ngo Van Tai',
    role: 'Head of Technology',
    departments: ['Executive Board', 'Technology'],
    image: '/members/tai.png',
    bio: 'Technology department leader with expertise in both software and hardware domains. Tai manages and navigates the entire tech department, bridging development teams and ensuring seamless integration across all technical initiatives.',
    quote: 'The journey of a thousand miles begins with a single step.',
    socials: {
      facebook: 'https://www.facebook.com/van.tai.461142/',
      linkedin: 'https://www.linkedin.com/in/taivanngo',
    },
  },
  {
    name: 'Mai Dang Khoa',
    role: 'Software Manager',
    departments: ['Technology'],
    image: '/members/khoa.png',
    bio: 'Software architect and algorithm enthusiast who transforms complex problems into elegant solutions. Khoa leads our development teams and champions best practices in modern software engineering.',
    quote: 'Code is poetry written for machines but read by humans.',
    socials: {
      facebook: 'https://www.facebook.com/kyle.mai261/',
      linkedin: 'https://www.linkedin.com/in/kylemai261',
    },
  },
];
