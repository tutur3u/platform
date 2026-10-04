import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import { listEducationTodo } from './service';

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

function dbMock(
  results: Record<string, { data: unknown; error?: unknown; count?: number }[]>
) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = (table: string) => {
    const result = results[table]?.shift();
    if (!result) throw new Error(`Unexpected table ${table}`);
    const query: Record<string, unknown> = {};
    for (const method of [
      'select',
      'eq',
      'neq',
      'is',
      'in',
      'order',
      'range',
      'maybeSingle',
      'not',
    ])
      query[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return query;
      };
    // biome-ignore lint/suspicious/noThenProperty: PostgREST query builders are intentional thenables.
    query.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ error: null, ...result }).then(resolve);
    return query;
  };
  const db = {
    from,
    schema: () => ({ from }),
  } as unknown as TypedSupabaseClient;
  return { db, calls };
}
function base(extra = {}) {
  return {
    workspace_secrets: [{ data: { value: 'true' } }],
    workspace_user_linked_users: [{ data: { virtual_user_id: 'own-actor' } }],
    ...extra,
  };
}
const input = {
  wsId: 'workspace',
  userId: 'signed-in-user',
  app: 'learn' as const,
  kind: 'tutoring' as const,
  page: 2,
  pageSize: 20,
};

describe('personal education to do', () => {
  it.each(['learn', 'teach'] as const)(
    'scopes %s tutoring to the own link and explicit assignment',
    async (app) => {
      const { db, calls } = dbMock(
        base({
          workspace_users: [
            {
              data: [
                {
                  id: 'counterpart',
                  display_name: 'Synthetic participant',
                  full_name: null,
                },
              ],
            },
          ],
          workspace_tutoring_sessions: [
            {
              data: [
                {
                  id: 'session',
                  teacher_user_id:
                    app === 'teach' ? 'own-actor' : 'counterpart',
                  student_user_id:
                    app === 'learn' ? 'own-actor' : 'counterpart',
                  group_id: 'other-homeroom',
                  content: 'Synthetic session',
                  session_date: '2026-10-04',
                  start_time: '09:30',
                  duration_minutes: 60,
                },
              ],
              count: 21,
            },
          ],
        })
      );
      const result = await listEducationTodo({ ...input, db, app });
      expect(calls).toContainEqual({
        table: 'workspace_user_linked_users',
        method: 'eq',
        args: ['platform_user_id', 'signed-in-user'],
      });
      expect(calls).toContainEqual({
        table: 'workspace_user_linked_users',
        method: 'eq',
        args: ['workspace_users.ws_id', 'workspace'],
      });
      expect(calls).toContainEqual({
        table: 'workspace_tutoring_sessions',
        method: 'eq',
        args: [
          app === 'teach' ? 'teacher_user_id' : 'student_user_id',
          'own-actor',
        ],
      });
      expect(calls).toContainEqual({
        table: 'workspace_tutoring_sessions',
        method: 'eq',
        args: ['ws_id', 'workspace'],
      });
      expect(calls).toContainEqual({
        table: 'workspace_tutoring_sessions',
        method: 'range',
        args: [20, 39],
      });
      expect(calls).toContainEqual({
        table: 'workspace_users',
        method: 'eq',
        args: ['ws_id', 'workspace'],
      });
      expect(calls).toContainEqual({
        table: 'workspace_users',
        method: 'in',
        args: ['id', ['counterpart']],
      });
      expect(result.data[0]?.participantName).toBe('Synthetic participant');
      expect(result.totalPages).toBe(2);
      expect(result.data[0]?.durationMinutes).toBe(60);
    }
  );
  it('returns empty for a parent without an own learner link and never falls back to a child', async () => {
    const { db, calls } = dbMock(
      base({ workspace_user_linked_users: [{ data: null }] })
    );
    expect((await listEducationTodo({ ...input, db })).data).toEqual([]);
    expect(
      calls.some((call) => call.table === 'tulearn_parent_student_links')
    ).toBe(false);
  });
  it('keeps learner assignments in actual student memberships and marks only own completion', async () => {
    const { db, calls } = dbMock(
      base({
        workspace_user_groups_users: [{ data: [{ group_id: 'own-course' }] }],
        user_group_posts: [
          {
            data: [
              {
                id: 'post',
                title: 'Synthetic assignment',
                group_id: 'own-course',
              },
            ],
            count: 1,
          },
        ],
        user_group_post_checks: [{ data: [{ post_id: 'post' }] }],
      })
    );
    const result = await listEducationTodo({
      ...input,
      db,
      kind: 'assignments',
      page: 1,
    });
    expect(calls).toContainEqual({
      table: 'workspace_user_groups_users',
      method: 'eq',
      args: ['role', 'STUDENT'],
    });
    expect(calls).toContainEqual({
      table: 'workspace_user_groups_users',
      method: 'eq',
      args: ['workspace_user_groups.ws_id', 'workspace'],
    });
    expect(calls).toContainEqual({
      table: 'user_group_posts',
      method: 'in',
      args: ['group_id', ['own-course']],
    });
    expect(calls).toContainEqual({
      table: 'user_group_posts',
      method: 'eq',
      args: ['post_approval_status', 'APPROVED'],
    });
    expect(calls).toContainEqual({
      table: 'user_group_post_checks',
      method: 'eq',
      args: ['user_id', 'own-actor'],
    });
    expect(result.data[0]?.completed).toBe(true);
  });
  it('shows only own teaching assignment drafts, not all workspace posts', async () => {
    const { db, calls } = dbMock(
      base({
        workspace_user_groups_users: [
          { data: [{ group_id: 'teaching-course' }] },
        ],
        user_group_posts: [{ data: [], count: 0 }],
      })
    );
    await listEducationTodo({
      ...input,
      db,
      app: 'teach',
      kind: 'assignments',
    });
    expect(calls).toContainEqual({
      table: 'workspace_user_groups_users',
      method: 'eq',
      args: ['role', 'TEACHER'],
    });
    expect(calls).toContainEqual({
      table: 'user_group_posts',
      method: 'eq',
      args: ['creator_id', 'own-actor'],
    });
    expect(calls).toContainEqual({
      table: 'user_group_posts',
      method: 'neq',
      args: ['post_approval_status', 'APPROVED'],
    });
  });
  it('fails explicitly when the actor lookup fails', async () => {
    const { db } = dbMock(
      base({
        workspace_user_linked_users: [
          { data: null, error: new Error('lookup failed') },
        ],
      })
    );
    await expect(listEducationTodo({ ...input, db })).rejects.toThrow(
      'lookup failed'
    );
  });
  it('does not read assigned records when education is disabled', async () => {
    const { db, calls } = dbMock({
      workspace_secrets: [{ data: { value: 'false' } }],
    });
    await expect(listEducationTodo({ ...input, db })).rejects.toThrow(
      'Education is not enabled'
    );
    expect(
      calls.some((call) => call.table === 'workspace_user_linked_users')
    ).toBe(false);
  });
  it.each(['learn', 'teach'] as const)(
    'keeps %s lessons inside assigned courses and correct publication state',
    async (app) => {
      const { db, calls } = dbMock(
        base({
          workspace_user_groups_users: [{ data: [{ group_id: 'course' }] }],
          workspace_course_modules: [
            {
              data: [
                { id: 'lesson', name: 'Synthetic lesson', group_id: 'course' },
              ],
              count: 1,
            },
          ],
          course_module_completion_status: [
            { data: [{ module_id: 'lesson' }] },
          ],
        })
      );
      const result = await listEducationTodo({
        ...input,
        db,
        app,
        kind: 'lessons',
      });
      expect(calls).toContainEqual({
        table: 'workspace_course_modules',
        method: 'in',
        args: ['group_id', ['course']],
      });
      expect(calls).toContainEqual({
        table: 'workspace_course_modules',
        method: 'eq',
        args: ['is_published', app === 'learn'],
      });
      expect(result.data[0]?.completed).toBe(app === 'learn');
      if (app === 'learn')
        expect(calls).toContainEqual({
          table: 'course_module_completion_status',
          method: 'eq',
          args: ['user_id', 'signed-in-user'],
        });
    }
  );
  it('counts only this learner submitted test attempts as completed', async () => {
    const { db, calls } = dbMock(
      base({
        workspace_user_groups_users: [{ data: [{ group_id: 'course' }] }],
        course_tests: [
          {
            data: [{ id: 'test', name: 'Synthetic test', course_id: 'course' }],
            count: 1,
          },
        ],
        course_test_attempts: [{ data: [{ test_id: 'test' }] }],
      })
    );
    const result = await listEducationTodo({ ...input, db, kind: 'tests' });
    expect(calls).toContainEqual({
      table: 'course_tests',
      method: 'eq',
      args: ['is_published', true],
    });
    expect(calls).toContainEqual({
      table: 'course_test_attempts',
      method: 'eq',
      args: ['user_id', 'signed-in-user'],
    });
    expect(result.data[0]?.completed).toBe(true);
  });
});
