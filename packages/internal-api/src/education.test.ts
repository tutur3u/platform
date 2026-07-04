import { describe, expect, it, vi } from 'vitest';
import { getWorkspaceQuizSets } from './education';

function createJsonResponse(data: unknown) {
  return {
    json: async () => data,
    ok: true,
    status: 200,
  };
}

describe('education internal API helpers', () => {
  it('hydrates workspace quiz sets with linked course module names', async () => {
    const quizSetId = '00000000-0000-4000-8000-000000000001';
    const courseId = '00000000-0000-4000-8000-000000000002';
    const moduleId = '00000000-0000-4000-8000-000000000003';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (
        url ===
        'https://internal.example.com/api/v1/workspaces/ws%201/quiz-sets?page=2&pageSize=10&q=algebra'
      ) {
        return createJsonResponse({
          data: [
            {
              id: quizSetId,
              name: 'Algebra warmup',
              created_at: '2026-06-24T07:00:00.000Z',
              linked_modules_count: 1,
            },
          ],
          count: 1,
          page: 2,
          pageSize: 10,
        });
      }

      if (
        url ===
        `https://internal.example.com/api/v1/workspaces/ws%201/quiz-sets/${quizSetId}/linked-modules?page=1&pageSize=100`
      ) {
        return createJsonResponse({
          data: [
            {
              id: moduleId,
              group_id: courseId,
              name: 'Linear equations',
              is_public: true,
              is_published: true,
            },
          ],
          count: 1,
          page: 1,
          pageSize: 100,
        });
      }

      if (
        url ===
        'https://internal.example.com/api/v1/workspaces/ws%201/courses?page=1&pageSize=100&status=all'
      ) {
        return createJsonResponse({
          data: [
            {
              id: courseId,
              name: 'Math 101',
              archived: false,
              cert_template: null,
              created_at: null,
              description: null,
              ending_date: null,
              is_course_published: true,
              members_count: 0,
              modules_count: 1,
              starting_date: null,
            },
          ],
          count: 1,
          page: 1,
          pageSize: 100,
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    const result = await getWorkspaceQuizSets(
      'ws 1',
      { page: 2, pageSize: 10, q: 'algebra' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(result).toEqual({
      data: [
        {
          id: quizSetId,
          name: 'Algebra warmup',
          created_at: '2026-06-24T07:00:00.000Z',
          linked_modules: [
            {
              course_id: courseId,
              course_name: 'Math 101',
              module_id: moduleId,
              module_name: 'Linear equations',
            },
          ],
          linked_modules_count: 1,
        },
      ],
      count: 1,
      page: 2,
      pageSize: 10,
    });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://internal.example.com/api/v1/workspaces/ws%201/quiz-sets?page=2&pageSize=10&q=algebra',
      `https://internal.example.com/api/v1/workspaces/ws%201/quiz-sets/${quizSetId}/linked-modules?page=1&pageSize=100`,
      'https://internal.example.com/api/v1/workspaces/ws%201/courses?page=1&pageSize=100&status=all',
    ]);
  });
});
