import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { expect, it, vi } from 'vitest';
import { listLmsClassRoster } from './lms-class-roster';

it('binds the teacher and roster contacts to the same active workspace before projecting names', async () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    overrideTypes: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      error: null,
      data: {
        id: 'class',
        roster: [
          {
            user_id: 'learner',
            role: 'STUDENT',
            created_at: '2026-11-20T00:00:00Z',
            contact: { display_name: 'Alex', full_name: 'Alex Morgan' },
          },
        ],
      },
    }),
  };
  const from = vi.fn(() => query);
  const rows = await listLmsClassRoster({
    db: { from } as unknown as TypedSupabaseClient,
    wsId: 'workspace',
    classId: 'class',
    scope: { kind: 'teacher', contactId: 'teacher' },
    after: 'previous-contact',
    limit: 21,
  });
  expect(from).toHaveBeenCalledWith('workspace_user_groups');
  expect(query.select.mock.calls[0]?.[0]).toContain(
    'teacher:workspace_user_groups_users!workspace_user_roles_users_role_id_fkey!inner'
  );
  expect(query.eq.mock.calls).toEqual([
    ['ws_id', 'workspace'],
    ['id', 'class'],
    ['archived', false],
    ['is_guest', false],
    ['roster.contact.ws_id', 'workspace'],
    ['roster.contact.archived', false],
    ['teacher.user_id', 'teacher'],
    ['teacher.role', 'TEACHER'],
    ['teacher.contact.ws_id', 'workspace'],
    ['teacher.contact.archived', false],
  ]);
  expect(query.order).toHaveBeenCalledWith('user_id', {
    referencedTable: 'roster',
  });
  expect(query.limit).toHaveBeenCalledWith(21, { referencedTable: 'roster' });
  expect(query.gt).toHaveBeenCalledWith('roster.user_id', 'previous-contact');
  expect(rows).toEqual([
    {
      contact_id: 'learner',
      role: 'STUDENT',
      name: 'Alex Morgan',
      joined_at: '2026-11-20T00:00:00Z',
      updated_at: null,
    },
  ]);
});
