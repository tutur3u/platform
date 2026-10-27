// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModuleContentPage from '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/content/page';
import {
  getFlashcards as countFlashcards,
  getQuizSets as countQuizSets,
  getQuizzes as countQuizzes,
  getData as getModule,
} from '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/data';
import { getFlashcards } from '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/flashcards/data';
import ModulePreviewPage from '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/page';
import { getData as getQuizSets } from '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/quiz-sets/data';
import { getQuizzes } from '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/quizzes/data';
import ModuleYoutubeLinksPage from '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/youtube-links/page';
import type { CourseModulePageScope } from '@/lib/course-module-page-access';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  listResources: vi.fn(async () => ({ data: [], error: null })),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    from: mocks.from,
    storage: { from: () => ({ list: mocks.listResources }) },
    schema: (schema: string) => ({
      from: (table: string) => mocks.from(`${schema}.${table}`),
    }),
  })),
}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/lib/resolve-route-workspace', () => ({
  resolveRouteWorkspace: async (wsId: string) => ({ resolvedWsId: wsId }),
}));
vi.mock('@tuturuuu/icons', () => ({
  BookText: 'BookText',
  Goal: 'Goal',
  ListTodo: 'ListTodo',
  Paperclip: 'Paperclip',
  Sparkles: 'Sparkles',
  SwatchBook: 'SwatchBook',
  Youtube: 'Youtube',
}));
vi.mock('@tuturuuu/ui/accordion', () => ({ Accordion: 'Accordion' }));
vi.mock('@tuturuuu/ui/button', () => ({ Button: 'Button' }));
vi.mock('@tuturuuu/ui/custom/feature-summary', () => ({
  default: 'FeatureSummary',
}));
vi.mock('@tuturuuu/ui/custom/education/modules/content-section', () => ({
  CourseSection: 'CourseSection',
}));
vi.mock('@tuturuuu/ui/custom/education/modules/resources/file-display', () => ({
  FileDisplay: 'FileDisplay',
}));
vi.mock('@tuturuuu/ui/custom/education/modules/youtube/embed', () => ({
  YoutubeEmbed: 'YoutubeEmbed',
}));
vi.mock(
  '@tuturuuu/ui/custom/education/modules/youtube/delete-link-button',
  () => ({ default: 'DeleteLinkButton' })
);
vi.mock('@tuturuuu/ui/custom/education/modules/youtube/form', () => ({
  default: 'YouTubeLinkForm',
}));
vi.mock('@tuturuuu/ui/separator', () => ({ Separator: 'Separator' }));
vi.mock('@tuturuuu/ui/text-editor/editor', () => ({
  RichTextEditor: 'RichTextEditor',
}));
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/flashcards/client-flashcards',
  () => ({ default: 'ClientFlashcards' })
);
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/quizzes/client-quizzes',
  () => ({ default: 'ClientQuizzes' })
);
vi.mock(
  '@/app/[locale]/(dashboard)/[wsId]/education/courses/[courseId]/modules/[moduleId]/content/content-editor',
  () => ({ ModuleContentEditor: 'ModuleContentEditor' })
);

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
  content: { type: 'doc', content: [] },
  youtube_links: ['https://www.youtube.com/watch?v=own-video'],
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
      quiz_options: [{ id: 'option-1', is_correct: true }],
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
  singular = false;
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
    this.singular = true;
    return this;
  }
  single() {
    return this.maybeSingle();
  }
  execute(): { data: Row[] | Row | null; error: Error | null; count: number } {
    const data = (tables[this.table] ?? []).filter((row) => {
      const module =
        this.table === 'workspace_course_modules'
          ? row
          : modules.find((m) => m.id === row.module_id);
      const group = groups.find((g) => g.id === module?.group_id);
      const moduleInner =
        this.table === 'workspace_course_modules' ||
        this.selected.includes('workspace_course_modules!inner');
      const groupInner = this.selected.includes('workspace_user_groups!inner');
      if (moduleInner && (!module || (groupInner && !group))) return false;
      return [...this.filters].every(([key, expected]) => {
        // Embedded filters only remove parents through an unbroken inner-join path.
        if (
          key.endsWith('workspace_user_groups.ws_id') &&
          (!moduleInner || !groupInner)
        )
          return true;
        if (key === 'workspace_course_modules.group_id' && !moduleInner)
          return true;
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
      data: this.head ? null : this.singular ? (data[0] ?? null) : data,
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
  [
    'preview',
    (ids: CourseModulePageScope) =>
      ModulePreviewPage({ params: Promise.resolve({ ...ids, locale: 'en' }) }),
  ],
  [
    'content',
    (ids: CourseModulePageScope) =>
      ModuleContentPage({ params: Promise.resolve(ids) }),
  ],
  [
    'youtube links',
    (ids: CourseModulePageScope) =>
      ModuleYoutubeLinksPage({ params: Promise.resolve(ids) }),
  ],
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
        expect(mocks.listResources).not.toHaveBeenCalled();
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
      expect(mocks.listResources).not.toHaveBeenCalled();
      expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
        'workspace_course_modules',
      ]);
    });
  });
}

describe('own workspace module data', () => {
  it('loads preview resources, flashcards and quiz options after validation', async () => {
    const preview = await ModulePreviewPage({
      params: Promise.resolve({ ...scope, locale: 'en' }),
    });
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
      'workspace_course_modules',
      'course_module_flashcards',
      'course_module_quizzes',
    ]);
    expect(mocks.listResources).toHaveBeenCalledWith(
      `${scope.wsId}/courses/${scope.courseId}/modules/${scope.moduleId}/resources/`,
      { sortBy: { column: 'created_at', order: 'desc' } }
    );
    const quizzes =
      preview.props.children[3].props.content.props.children.props.quizzes;
    expect(quizzes).toEqual([tables.course_module_quizzes?.[0]]);
    expect(quizzes[0].quiz_options[0].is_correct).toBe(true);
  });
  it('returns module content to the editor', async () => {
    const page = await ModuleContentPage({ params: Promise.resolve(scope) });
    expect(page.props.children[1].props.content).toEqual(ownModule.content);
  });
  it('returns module YouTube links to the form', async () => {
    const page = await ModuleYoutubeLinksPage({
      params: Promise.resolve(scope),
    });
    expect(page.props.children[0].props.form.props.links).toEqual(
      ownModule.youtube_links
    );
  });
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

describe('PostgREST fixture join semantics', () => {
  it.each([
    [
      'workspace_course_modules',
      'workspace_user_groups(ws_id)',
      'workspace_user_groups.ws_id',
    ],
    [
      'course_module_quizzes',
      'workspace_course_modules!inner(workspace_user_groups(ws_id))',
      'workspace_course_modules.workspace_user_groups.ws_id',
    ],
    [
      'course_module_quizzes',
      'workspace_course_modules(workspace_user_groups!inner(ws_id))',
      'workspace_course_modules.workspace_user_groups.ws_id',
    ],
    [
      'course_module_quizzes',
      'workspace_course_modules(group_id)',
      'workspace_course_modules.group_id',
    ],
  ])('keeps parent rows for a left join in %s: %s', (table, select, key) => {
    const query = new Query(table).select(select).eq(key, 'missing');
    expect(query.execute().data).toEqual(tables[table]);
  });
});
