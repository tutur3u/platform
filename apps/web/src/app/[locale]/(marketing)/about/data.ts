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
}[] = [
  {
    name: 'Vo Khanh Quynh',
    role: 'Liaison Vice President',
    departments: ['Executive Board', 'Human Resources', 'External Relations'],
  },
  {
    name: 'Cao Nguyen Viet Quang',
    role: 'President',
    departments: ['Executive Board', 'External Relations'],
  },
  {
    name: 'Vo Hoang Phuc',
    role: 'Technical Vice President',
    departments: ['Executive Board', 'Technology', 'External Relations'],
  },
  {
    name: 'Huynh Tan Phat',
    role: 'Chief of Finance',
    departments: ['Executive Board', 'Finance'],
  },
  {
    name: 'Huynh Hoang Duc',
    role: 'Head of Technology',
    departments: ['Technology'],
  },
  {
    name: 'Dao Ngoc Khanh',
    role: 'Head of Marketing',
    departments: ['Marketing'],
  },
];
