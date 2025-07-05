export const members: {
  name: string;
  role: string;
  departments: (
    | 'Executive Board'
    | 'Technology'
    | 'Marketing'
    | 'Human Resources'
    | 'Finance'
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
    departments: ['Executive Board', 'Finance'],
    image: '/members/kim.png',
    bio: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    quote: 'The best way to predict the future is to create it.',
    socials: {
      facebook: '#',
      linkedin: '#',
    },
  },
  {
    name: 'Nguyen Ha Gia Tam',
    role: 'Head of HR',
    departments: ['Executive Board', 'Human Resources'],
    image: '/members/tam.png',
    bio: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    quote: 'Innovation distinguishes between a leader and a follower.',
    socials: {
      facebook: '#',
      linkedin: '#',
    },
  },
  {
    name: 'Huynh Hoang Duc',
    role: 'President',
    departments: ['Executive Board', 'Technology'],
    image: '/members/duc.png',
    bio: 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    quote: 'Your work is going to fill a large part of your life.',
    socials: {
      facebook: '#',
      linkedin: '#',
    },
  },
  {
    name: 'Phung Khanh Minh',
    role: 'Head of Marcom',
    departments: ['Executive Board', 'Marketing'],
    image: '/members/minh.png',
    bio: 'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
    quote: 'Strive not to be a success, but rather to be of value.',
    socials: {
      facebook: '#',
      linkedin: '#',
    },
  },
  {
    name: 'Huynh Thai Duong',
    role: 'Hardware Manager',
    departments: ['Technology'],
    image: '/members/duong.png',
    bio: 'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam.',
    quote: 'The only way to do great work is to love what you do.',
    socials: {
      facebook: '#',
      linkedin: '#',
    },
  },
  {
    name: 'Ngo Van Tai',
    role: 'Head of Technology',
    departments: ['Executive Board', 'Technology'],
    image: '/members/tai1.png',
    bio: 'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.',
    quote: 'The journey of a thousand miles begins with a single step.',
    socials: {
      facebook: '#',
      linkedin: '#',
    },
  },
  {
    name: 'Mai Dang Khoa',
    role: 'Software Manager',
    departments: ['Technology'],
    image: '/members/khoa.png',
    bio: 'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.',
    quote: 'The journey of a thousand miles begins with a single step.',
    socials: {
      facebook: '#',
      linkedin: '#',
    },
  },
];
