import { WorkspaceCourseModule } from '@tuturuuu/types/db';

export const mockAllModules = [
  {
    id: 'mod-001',
    name: 'Introduction to Physics',
    is_public: true,
    is_published: true,
    workspace_courses: {
      ws_id: 'ws_1',
    },
  },
  {
    id: 'mod-002',
    name: 'Advanced Calculus',
    is_public: false,
    is_published: false,
    workspace_courses: {
      ws_id: 'ws_1',
    },
  },
  {
    id: 'mod-003',
    name: 'Biology Basics',
    is_public: true,
    is_published: false,
    workspace_courses: {
      ws_id: 'ws_1',
    },
  },
];

export const mockLinkedModules: Partial<WorkspaceCourseModule>[] = [
  {
    id: 'mod-001', // corresponds to module_id
    course_id: 'course-101',
    name: 'Introduction to Physics',
    is_public: true,
    is_published: true,
  },
  {
    id: 'mod-003',
    course_id: 'course-103',
    name: 'Biology Basics',
    is_public: true,
    is_published: false,
  },
];
export const mockMappedModules: Partial<WorkspaceCourseModule>[] =
  mockLinkedModules.map((m) => ({
    ...m,
    ws_id: 'ws_1',
    href: `/ws_1/education/courses/${m.course_id}/modules/${m.id}`,
  }));

export const mockLinkerData = mockAllModules.map((m) => ({
  ...m,
  selected: mockLinkedModules.some((linked) => linked.id === m.id),
}));
