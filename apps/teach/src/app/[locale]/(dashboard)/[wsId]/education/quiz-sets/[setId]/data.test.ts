import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOREIGN_SET,
  OWN_SET,
  OWN_WS,
  resolveScopeLookup,
} from '@/lib/testing/education-scope-fixtures';
import { createFakeSupabase } from '@/lib/testing/fake-supabase';
import {
  getQuizSetLinkedModules,
  getQuizSetQuizzes,
  getQuizSetSummary,
} from './data';

const LINK_TABLES = ['quiz_set_quizzes', 'course_module_quiz_sets'];

const mocks = vi.hoisted(() => ({
  admin: null as unknown as ReturnType<
    typeof import('@/lib/testing/fake-supabase').createFakeSupabase
  >,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => mocks.admin.client,
}));

vi.mock('@tuturuuu/education-core/education/access', () => ({
  requireEducationWorkspaceAccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

describe('quiz set dashboard data', () => {
  beforeEach(() => {
    mocks.admin = createFakeSupabase(
      (call) =>
        resolveScopeLookup(call) ??
        (LINK_TABLES.includes(call.table) ? { data: [{}], count: 1 } : {})
    );
  });

  it.each([
    ['layout summary', () => getQuizSetSummary(OWN_WS, FOREIGN_SET)],
    ['quizzes page', () => getQuizSetQuizzes(OWN_WS, FOREIGN_SET)],
    ['linked modules page', () => getQuizSetLinkedModules(OWN_WS, FOREIGN_SET)],
  ])(
    '%s calls notFound for a set in another workspace before reading links',
    async (_name, load) => {
      await expect(load()).rejects.toThrow('NEXT_NOT_FOUND');
      for (const table of LINK_TABLES) {
        expect(mocks.admin.tables()).not.toContain(table);
      }
    }
  );

  it('loads the summary for a set in the workspace', async () => {
    await expect(getQuizSetSummary(OWN_WS, OWN_SET)).resolves.toMatchObject({
      set: { id: OWN_SET, ws_id: OWN_WS },
      linkedQuizzes: 1,
      linkedModules: 1,
    });
  });

  it('loads quizzes and linked modules for a set in the workspace', async () => {
    await expect(getQuizSetQuizzes(OWN_WS, OWN_SET)).resolves.toMatchObject({
      count: 1,
    });
    await expect(
      getQuizSetLinkedModules(OWN_WS, OWN_SET, { q: 'Own' })
    ).resolves.toMatchObject({ count: 1 });
  });

  it('throws when the quiz set lookup fails', async () => {
    mocks.admin = createFakeSupabase(() => ({ error: { message: 'boom' } }));

    await expect(getQuizSetQuizzes(OWN_WS, OWN_SET)).rejects.toThrow(
      'Failed to validate quiz set'
    );
    expect(mocks.admin.tables()).not.toContain('quiz_set_quizzes');
  });
});
