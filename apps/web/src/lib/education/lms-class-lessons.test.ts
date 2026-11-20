import { createClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types/supabase';
import { expect, it, vi } from 'vitest';
import { listLmsClassLessons } from './lms-class-lessons';

const wsId = 'c7100000-0000-4000-8000-000000000001';
const classId = 'c7100000-0000-4000-8000-000000000002';
const contactId = 'c7100000-0000-4000-8000-000000000003';
const lessonId = 'c7100000-0000-4000-8000-000000000004';

function database(rows: unknown[]) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json(rows));
  const db = createClient<Database>(
    'https://database.example.test',
    'test-key',
    {
      auth: { persistSession: false },
      global: { fetch },
    }
  );
  return {
    db,
    request: () => {
      expect(fetch).toHaveBeenCalledTimes(1);
      return new URL(String(fetch.mock.calls[0]?.[0]));
    },
  };
}

it('bounds and scopes the published learner page within one class read', async () => {
  const lesson = {
    id: lessonId,
    name: 'Linear functions',
    sort_key: 7,
    is_published: true,
  };
  const { db, request } = database([{ id: classId, lessons: [lesson] }]);
  const rows = await listLmsClassLessons({
    db,
    wsId,
    classId,
    scope: { kind: 'student', contactId },
    after: { sortKey: 5, id: lessonId },
    limit: 21,
  });
  const url = request();
  expect(url.pathname).toBe('/rest/v1/workspace_user_groups');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    select:
      'id,lessons:workspace_course_modules!workspace_course_modules_group_id_fkey(id,name,sort_key,is_published),enrollment:workspace_user_groups_users!workspace_user_roles_users_role_id_fkey!inner(user_id,contact:workspace_users!workspace_user_roles_users_user_id_fkey!inner(id))',
    ws_id: `eq.${wsId}`,
    id: `eq.${classId}`,
    archived: 'eq.false',
    is_guest: 'eq.false',
    'lessons.order': 'sort_key.asc,id.asc',
    'lessons.limit': '21',
    'enrollment.user_id': `eq.${contactId}`,
    'enrollment.role': 'eq.STUDENT',
    'enrollment.contact.ws_id': `eq.${wsId}`,
    'enrollment.contact.archived': 'eq.false',
    is_course_published: 'eq.true',
    'lessons.is_published': 'eq.true',
    'lessons.or': `(sort_key.gt.5,and(sort_key.eq.5,id.gt.${lessonId}))`,
  });
  expect(rows).toEqual([lesson]);
});

it('reads drafts only in the scoped staff projection', async () => {
  const { db, request } = database([]);
  const rows = await listLmsClassLessons({
    db,
    wsId,
    classId,
    scope: { kind: 'teacher', contactId },
    limit: 21,
  });
  const { searchParams } = request();
  expect(searchParams.get('enrollment.user_id')).toBe(`eq.${contactId}`);
  expect(searchParams.get('enrollment.role')).toBe('eq.TEACHER');
  expect(searchParams.has('is_course_published')).toBe(false);
  expect(searchParams.has('lessons.is_published')).toBe(false);
  expect(rows).toBeNull();
});

it('distinguishes an accessible empty class from a missing class', async () => {
  const { db, request } = database([{ id: classId, lessons: [] }]);
  const rows = await listLmsClassLessons({
    db,
    wsId,
    classId,
    scope: { kind: 'administrator' },
    limit: 21,
  });
  expect(request().searchParams.get('select')).not.toContain('enrollment:');
  expect(rows).toEqual([]);
});
