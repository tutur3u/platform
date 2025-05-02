// Defining mock data for testing

export interface MockCourse {
  id: string;
  name: string;
  modules: number;
  course_id?: string;
  created_at?: string;
  is_public?: boolean;
  is_published?: boolean;
}
export const mockData = (): MockCourse[] => [
  {
    id: '1',
    name: 'Course 1',
    modules: 3,
    created_at: '2025-05-02T12:00:00Z',
    is_public: true,
    is_published: true,
    course_id: 'COURSE-001',
  },
  {
    id: '2',
    name: 'Course 2',
    modules: 5,
    created_at: '2025-05-01T12:00:00Z',
    is_public: false,
    is_published: true,
  },
  {
    id: '3',
    name: 'Course 3',
    modules: 2,
    created_at: '2025-04-30T12:00:00Z',
    is_public: true,
    is_published: false,
  },
];
