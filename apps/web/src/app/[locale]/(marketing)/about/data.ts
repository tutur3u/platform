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
}[] = [
  {
    name: 'Vo Khanh Quynh',
    role: 'Liaison Vice President',
    departments: ['Executive Board', 'Human Resources', 'External Relations'],
    image: '/members/quynh.jpg',
  },
  {
    name: 'Cao Nguyen Viet Quang',
    role: 'President',
    departments: ['Executive Board', 'External Relations'],
    image: '/members/quang.jpg',
  },
  {
    name: 'Vo Hoang Phuc',
    role: 'Technical Vice President',
    departments: ['Executive Board', 'Technology', 'External Relations'],
    image: '/members/phuc.jpg',
  },
  {
    name: 'Huynh Tan Phat',
    role: 'Chief of Finance',
    departments: ['Executive Board', 'Finance'],
    image: '/members/phat.jpg',
  },
  {
    name: 'Huynh Hoang Duc',
    role: 'Head of Technology',
    departments: ['Technology'],
    image: '/members/duc.jpg',
  },
  {
    name: 'Dao Ngoc Khanh',
    role: 'Head of Marketing',
    departments: ['Marketing'],
    image: '/members/khanh.jpg',
  },
];
