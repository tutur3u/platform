import type { WorkspaceCourse } from '@tuturuuu/types/db';

export const mockData = (): WorkspaceCourse[] => [
  {
    id: '1',
    name: 'Course 1',
    created_at: '2025-05-02T12:00:00Z',
    is_public: true,
    is_published: true,
    ws_id: 'ws_1',
    href: '/ws_1/courses/1',
  },
  {
    id: '2',
    name: 'Course 2',
    created_at: '2025-05-01T12:00:00Z',
    is_public: false,
    is_published: true,
    ws_id: 'ws_1',
    href: '/ws_1/courses/2',
  },
  {
    id: '3',
    name: 'Course 3',
    created_at: '2025-04-30T12:00:00Z',
    is_public: true,
    is_published: false,
    ws_id: 'ws_1',
    href: '/ws_1/courses/3',
  },
];
