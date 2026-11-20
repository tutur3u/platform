import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { expect, it, vi } from 'vitest';
import { listLmsClasses } from './lms-class-catalog';

it.each([
  { kind: 'student', role: 'STUDENT', published: true },
  { kind: 'teacher', role: 'TEACHER', published: false },
] as const)(
  'pins the $kind catalog to workspace, active contact, and role',
  async ({ kind, role, published }) => {
    const group = {
      id: 'class',
      name: 'History',
      description: null,
      is_course_published: true,
    };
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => void) =>
        resolve({ data: [{ group }], error: null }),
    };
    const from = vi.fn(() => query);
    const data = await listLmsClasses({
      db: { from } as unknown as TypedSupabaseClient,
      wsId: 'workspace',
      scope: { kind, contactId: 'contact' },
      after: 'last-class',
      limit: 21,
    });
    expect(data).toEqual([group]);
    expect(from).toHaveBeenCalledWith('workspace_user_groups_users');
    expect(query.eq.mock.calls).toEqual([
      ['user_id', 'contact'],
      ['role', role],
      ['contact.ws_id', 'workspace'],
      ['contact.archived', false],
      ['group.ws_id', 'workspace'],
      ['group.archived', false],
      ['group.is_guest', false],
      ...(published ? [['group.is_course_published', true]] : []),
    ]);
    expect(query.order).toHaveBeenCalledWith('group_id');
    expect(query.gt).toHaveBeenCalledWith('group_id', 'last-class');
    expect(query.limit).toHaveBeenCalledWith(21);
  }
);
