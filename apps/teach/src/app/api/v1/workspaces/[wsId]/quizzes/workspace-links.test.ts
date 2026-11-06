// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from './route';

const ws = '00000000-0000-4000-8000-000000008001';
const moduleId = '00000000-0000-4000-8000-000000008002';
const setId = '00000000-0000-4000-8000-000000008003';
const state = vi.hoisted(() => ({
  moduleAllowed: false,
  setAllowed: false,
  writes: [] as string[],
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        context: unknown,
        params: unknown
      ) => unknown
    ) =>
    async (request: NextRequest) =>
      handler(request, {}, { wsId: '00000000-0000-4000-8000-000000008001' }),
}));
vi.mock('@tuturuuu/education-core/education/private-quiz-answers', () => ({
  attachPrivateWorkspaceQuizAnswers: vi.fn(),
  setPrivateWorkspaceQuizAnswer: async () => {
    state.writes.push('answers');
  },
}));
vi.mock('@tuturuuu/education-core/education/revalidate-quiz-paths', () => ({
  revalidateCourseModuleQuizPaths: vi.fn(),
}));
vi.mock('@tuturuuu/education-core/teach/api', () => ({
  requireTeachWorkspaceAccess: async () => ({
    normalizedWsId: '00000000-0000-4000-8000-000000008001',
    sbAdmin: {
      from(table: string) {
        const filters = new Map<string, unknown>();
        const result = () => ({
          data:
            table === 'workspace_quiz_sets'
              ? state.setAllowed &&
                filters.get('ws_id') === '00000000-0000-4000-8000-000000008001'
                ? { id: 'set' }
                : null
              : table === 'workspace_course_modules'
                ? state.moduleAllowed &&
                  filters.get('workspace_user_groups.ws_id') ===
                    '00000000-0000-4000-8000-000000008001'
                  ? { id: 'module' }
                  : null
                : { id: 'quiz' },
          error: null,
        });
        const query = Object.assign(Promise.resolve({ error: null }), {
          select: () => query,
          eq: (column: string, value: unknown) => {
            filters.set(column, value);
            return query;
          },
          maybeSingle: async () => result(),
          single: async () => ({ data: { id: 'quiz' }, error: null }),
          insert: () => {
            state.writes.push(table);
            return query;
          },
        });
        return query;
      },
    },
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.moduleAllowed = false;
  state.setAllowed = false;
  state.writes = [];
});
async function post(links: { moduleId?: string; setId?: string }) {
  return POST(
    new NextRequest('http://localhost/api/quizzes', {
      method: 'POST',
      body: JSON.stringify({ ...links, quizzes: [{ question: 'Fixture?' }] }),
    }),
    { params: Promise.resolve({ wsId: ws }) }
  );
}
it('denies a foreign module before creating a quiz or answer', async () => {
  expect((await post({ moduleId })).status).toBe(404);
  expect(state.writes).toEqual([]);
});
it('denies a foreign quiz set before creating a quiz or answer', async () => {
  expect((await post({ setId })).status).toBe(404);
  expect(state.writes).toEqual([]);
});
it('keeps links into modules and sets in the resolved workspace', async () => {
  state.moduleAllowed = true;
  state.setAllowed = true;
  expect((await post({ moduleId, setId })).status).toBe(200);
  expect(state.writes).toEqual([
    'workspace_quizzes',
    'answers',
    'course_module_quizzes',
    'quiz_set_quizzes',
  ]);
});

it('validates every destination before writing when a module is allowed but a set is foreign', async () => {
  state.moduleAllowed = true;
  expect((await post({ moduleId, setId })).status).toBe(404);
  expect(state.writes).toEqual([]);
});
