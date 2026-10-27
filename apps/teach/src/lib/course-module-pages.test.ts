// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getFlashcards as countFlashcards,
  getQuizSets as countQuizSets,
  getQuizzes as countQuizzes,
  getData as getModule,
} from '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/data';
import { getFlashcards } from '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/flashcards/data';
import { getData as getQuizSets } from '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/quiz-sets/data';
import { getQuizzes } from '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/quizzes/data';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    from: mocks.from,
    schema: (schema: string) => ({
      from: (table: string) => mocks.from(`${schema}.${table}`),
    }),
  })),
}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));

type Row = Record<string, unknown>;
const scope = {
  wsId: 'own-workspace',
  courseId: 'own-course',
  moduleId: 'own-module',
};
const ownModule = {
  id: scope.moduleId,
  group_id: scope.courseId,
  name: 'Own module',
};
const groups = [
  { id: scope.courseId, ws_id: scope.wsId },
  { id: 'foreign-course', ws_id: 'foreign-workspace' },
  { id: 'other-own-course', ws_id: scope.wsId },
];
const modules = [
  ownModule,
  { id: 'foreign-module', group_id: 'foreign-course', name: 'Foreign module' },
  {
    id: 'other-own-module',
    group_id: 'other-own-course',
    name: 'Other module',
  },
  { id: 'orphan-module', group_id: 'missing-course', name: 'Orphan' },
];
const tables: Record<string, Row[]> = {
  workspace_course_modules: modules,
  course_module_quizzes: [
    {
      module_id: scope.moduleId,
      id: 'quiz-1',
      question: 'Question?',
      answer: null,
      quiz_options: [],
    },
    {
      module_id: 'foreign-module',
      id: 'foreign-quiz',
      question: 'Private foreign quiz',
    },
    {
      module_id: 'other-own-module',
      id: 'other-quiz',
      question: 'Other course quiz',
    },
  ],
  course_module_flashcards: [
    { module_id: scope.moduleId, id: 'card-1', front: 'Front', back: 'Back' },
    {
      module_id: 'foreign-module',
      id: 'foreign-card',
      front: 'Private foreign card',
    },
    {
      module_id: 'other-own-module',
      id: 'other-card',
      front: 'Other course card',
    },
  ],
  course_module_quiz_sets: [
    {
      module_id: scope.moduleId,
      id: 'set-1',
      name: 'Own quiz set',
      created_at: '2026-10-01',
    },
    {
      module_id: 'foreign-module',
      id: 'foreign-set',
      name: 'Private foreign set',
    },
    {
      module_id: 'other-own-module',
      id: 'other-set',
      name: 'Other course set',
    },
  ],
  'private.workspace_quiz_answers': [
    { quiz_id: 'quiz-1', answer: { correct: true } },
    { quiz_id: 'foreign-quiz', answer: { secret: true } },
  ],
};

// Execute filters against fixture rows so missing ownership predicates expose data.
class Query {
  filters = new Map<string, unknown>();
  selected = '';
  head = false;
  single = false;
  constructor(readonly table: string) {}
  select(value: string, options?: { head?: boolean }) {
    this.selected = value;
    this.head = options?.head ?? false;
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.set(key, value);
    return this;
  }
  in(key: string, values: unknown[]) {
    this.filters.set(key, values);
    return this;
  }
  order() {
    return this;
  }
  range() {
    return this;
  }
  limit() {
    return this;
  }
  ilike() {
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  execute(): { data: Row[] | Row | null; error: Error | null; count: number } {
    const data = (tables[this.table] ?? []).filter((row) => {
      const module =
        this.table === 'workspace_course_modules'
          ? row
          : modules.find((m) => m.id === row.module_id);
      const group = groups.find((g) => g.id === module?.group_id);
      if (this.selected.includes('workspace_user_groups!inner') && !group)
        return false;
      return [...this.filters].every(([key, expected]) => {
        const actual = key.endsWith('workspace_user_groups.ws_id')
          ? group?.ws_id
          : key === 'workspace_course_modules.group_id'
            ? module?.group_id
            : row[key];
        return Array.isArray(expected)
          ? expected.includes(actual)
          : actual === expected;
      });
    });
    return {
      data: this.head ? null : this.single ? (data[0] ?? null) : data,
      error: null,
      count: data.length,
    };
  }
  // biome-ignore lint/suspicious/noThenProperty: Supabase builders execute when awaited.
  then<TResult1 = ReturnType<Query['execute']>, TResult2 = never>(
    resolve?:
      | ((
          value: ReturnType<Query['execute']>
        ) => TResult1 | PromiseLike<TResult1>)
      | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockImplementation((table: string) => new Query(table));
});

const loaders = [
  ['quizzes', getQuizzes],
  ['quiz sets', getQuizSets],
  ['flashcards', getFlashcards],
  ['layout module', getModule],
] as const;

for (const [name, load] of loaders) {
  describe(name, () => {
    it.each([
      [
        'foreign workspace',
        { courseId: 'foreign-course', moduleId: 'foreign-module' },
      ],
      ['wrong URL course', { moduleId: 'other-own-module' }],
      ['missing module', { moduleId: 'missing-module' }],
      [
        'orphan course',
        { courseId: 'missing-course', moduleId: 'orphan-module' },
      ],
    ])(
      'returns notFound for %s before any content or private-answer reads',
      async (_, ids) => {
        await expect(load({ ...scope, ...ids })).rejects.toThrow(
          'NEXT_NOT_FOUND'
        );
        expect(mocks.notFound).toHaveBeenCalledOnce();
        expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
          'workspace_course_modules',
        ]);
      }
    );

    it('propagates ownership lookup errors before any content read', async () => {
      mocks.from.mockImplementation((table: string) => {
        const query = new Query(table);
        query.execute = () => ({
          data: null,
          error: new Error('lookup failed'),
          count: 0,
        });
        return query;
      });
      await expect(load(scope)).rejects.toThrow('lookup failed');
      expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
        'workspace_course_modules',
      ]);
    });
  });
}

describe('own workspace module data', () => {
  it('returns quizzes with their private answers after validation', async () => {
    expect(await getQuizzes(scope)).toEqual([
      { ...tables.course_module_quizzes?.[0], answer: { correct: true } },
    ]);
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
      'workspace_course_modules',
      'course_module_quizzes',
      'private.workspace_quiz_answers',
    ]);
  });
  it('returns the quiz sets and count', async () => {
    expect(await getQuizSets(scope)).toEqual({
      data: [tables.course_module_quiz_sets?.[0]],
      count: 1,
    });
  });
  it('returns flashcards', async () => {
    expect(await getFlashcards(scope)).toEqual([
      tables.course_module_flashcards?.[0],
    ]);
  });
  it('returns layout module data', async () => {
    expect(await getModule(scope)).toEqual(ownModule);
  });
});

for (const [name, count] of [
  ['quizzes', countQuizzes],
  ['quiz sets', countQuizSets],
  ['flashcards', countFlashcards],
] as const) {
  describe(`${name} layout count`, () => {
    it('counts the own module', async () => {
      expect(await count(scope)).toBe(1);
    });
    it('excludes a module in another workspace even with its correct course ID', async () => {
      expect(
        await count({
          ...scope,
          courseId: 'foreign-course',
          moduleId: 'foreign-module',
        })
      ).toBe(0);
    });
    it('excludes a module under the wrong course in the same workspace', async () => {
      expect(await count({ ...scope, moduleId: 'other-own-module' })).toBe(0);
    });
  });
}
