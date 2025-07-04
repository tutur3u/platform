export const members: {
  name: string;
  role: string;
  departments: (
    | 'Executive Board'
    | 'External Relations'
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
    twitter: string;
    linkedin: string;
  };
}[] = [
  {
    name: 'Vo Khanh Quynh',
    role: 'Liaison Vice President',
    departments: ['Executive Board', 'Human Resources', 'External Relations'],
    image: '/members/quynh.jpg',
    bio: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    quote: 'The best way to predict the future is to create it.',
    socials: {
      facebook: '#',
      twitter: '#',
      linkedin: '#',
    },
  },
  {
    name: 'Cao Nguyen Viet Quang',
    role: 'President',
    departments: ['Executive Board', 'External Relations'],
    image: '/members/quang.jpg',
    bio: 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    quote: 'Innovation distinguishes between a leader and a follower.',
    socials: {
      facebook: '#',
      twitter: '#',
      linkedin: '#',
    },
  },
  {
    name: 'Vo Hoang Phuc',
    role: 'Technical Vice President',
    departments: ['Executive Board', 'Technology', 'External Relations'],
    image: '/members/phuc.jpg',
    bio: 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    quote: 'Your work is going to fill a large part of your life.',
    socials: {
      facebook: '#',
      twitter: '#',
      linkedin: '#',
    },
  },
  {
    name: 'Huynh Tan Phat',
    role: 'Chief of Finance',
    departments: ['Executive Board', 'Finance'],
    image: '/members/phat.jpg',
    bio: 'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
    quote: 'Strive not to be a success, but rather to be of value.',
    socials: {
      facebook: '#',
      twitter: '#',
      linkedin: '#',
    },
  },
  {
    name: 'Huynh Hoang Duc',
    role: 'Head of Technology',
    departments: ['Technology'],
    image: '/members/duc.jpg',
    bio: 'Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam.',
    quote: 'The only way to do great work is to love what you do.',
    socials: {
      facebook: '#',
      twitter: '#',
      linkedin: '#',
    },
  },
  {
    name: 'Dao Ngoc Khanh',
    role: 'Head of Marketing',
    departments: ['Marketing'],
    image: '/members/khanh.jpg',
    bio: 'Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.',
    quote: 'The journey of a thousand miles begins with a single step.',
    socials: {
      facebook: '#',
      twitter: '#',
      linkedin: '#',
    },
  },
];
