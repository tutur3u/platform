import { describe, expect, it, vi } from 'vitest';
import { getLearnerCourseDetail, getLearnerCourseSummaries } from './courses';
import type { Db } from './types';

vi.mock('./db', () => ({ getAdmin: async (db: Db) => db }));

function fixture(released: boolean, correct: boolean) {
  const course = { id: 'course', name: 'Course', description: null };
  const modules = [
    {
      id: 'current',
      group_id: course.id,
      is_published: true,
      is_quiz_score_published: released,
      course_module_quizzes: [{ quiz_id: 'first' }, { quiz_id: 'second' }],
    },
    {
      id: 'next',
      group_id: course.id,
      is_published: true,
      is_quiz_score_published: false,
      course_module_quizzes: [],
    },
  ];
  const submissions = [
    { module_id: 'current', quiz_id: 'removed', is_correct: true },
    { module_id: 'current', quiz_id: 'first', is_correct: correct },
  ];
  const submissionReads = vi.fn();
  const db = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query = {
        select: () => query,
        order: () => query,
        range: () => query,
        eq(column: string, value: unknown) {
          filters[column] = value;
          return query;
        },
        in(column: string, values: string[]) {
          filters[column] = values;
          return query;
        },
        maybeSingle: async () => ({ data: course, error: null }),
        then(resolve: (result: { data: unknown; error: null }) => void) {
          let data: unknown;
          switch (table) {
            case 'workspace_user_groups_users':
              data = [{ group_id: course.id }];
              break;
            case 'workspace_user_groups':
              data = [course];
              break;
            case 'workspace_course_modules':
              data = modules;
              break;
            case 'course_module_quiz_submissions':
              submissionReads(filters);
              data = submissions.filter(
                (submission) => submission.is_correct === filters.is_correct
              );
              break;
            case 'course_module_flashcards':
              data = [
                { module_id: 'current', ws_id: 'workspace' },
                { module_id: 'current', ws_id: 'other-workspace' },
              ].filter((card) =>
                filters['workspace_flashcards.ws_id']
                  ? card.ws_id === filters['workspace_flashcards.ws_id']
                  : true
              );
              break;
            case 'course_module_quiz_sets':
            case 'course_tests':
              data = [];
              break;
            default:
              throw new Error(`Unexpected table ${table}`);
          }
          resolve({ data, error: null });
        },
      };
      return query;
    },
  } as unknown as Db;

  return {
    params: {
      courseId: course.id,
      db,
      studentPlatformUserId: 'student',
      studentWorkspaceUserId: 'workspace-student',
      wsId: 'workspace',
    },
    submissionReads,
  };
}

describe('Learn lesson progression', () => {
  it.each([
    { released: false, correct: false, passed: false },
    { released: false, correct: true, passed: false },
    { released: true, correct: false, passed: false },
    { released: true, correct: true, passed: true },
  ])(
    'uses the published result for lesson completion and the next lesson lock ($released, $correct)',
    async ({ released, correct, passed }) => {
      const { params, submissionReads } = fixture(released, correct);
      const detail = await getLearnerCourseDetail(params);
      const [summary] = await getLearnerCourseSummaries(params);

      expect(
        detail?.modules.map(({ completed, locked }) => ({
          completed,
          locked,
        }))
      ).toEqual([
        { completed: passed, locked: false },
        { completed: true, locked: !passed },
      ]);
      expect(summary?.completedModules).toBe(passed ? 2 : 1);
      expect(detail?.completedModules).toBe(summary?.completedModules);

      if (released) {
        expect(submissionReads).toHaveBeenCalledTimes(2);
        expect(submissionReads).toHaveBeenCalledWith({
          user_id: 'student',
          is_correct: true,
          module_id: ['current'],
        });
      } else {
        expect(submissionReads).not.toHaveBeenCalled();
      }
    }
  );
});

it('counts only flashcards owned by the module workspace', async () => {
  const { params } = fixture(false, false);
  const detail = await getLearnerCourseDetail(params);

  expect(detail?.modules.map((module) => module.counts.flashcards)).toEqual([
    1, 0,
  ]);
});
