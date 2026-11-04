import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOREIGN_SET,
  OWN_SET,
  OWN_WS,
  resolveScopeLookup,
} from '@/lib/testing/education-scope-fixtures';
import { createFakeSupabase, eqValue } from '@/lib/testing/fake-supabase';
import { routeRequest } from '@/lib/testing/route-mocks';
import { GET } from './route';

const OWN_QUIZ = { id: 'quiz-1', question: 'Own question', ws_id: OWN_WS };

const mocks = vi.hoisted(() => ({
  admin: null as unknown as ReturnType<
    typeof import('@/lib/testing/fake-supabase').createFakeSupabase
  >,
}));

vi.mock('@/lib/api-auth', async () =>
  (await import('@/lib/testing/route-mocks')).sessionAuthMock(() => ({}))
);
vi.mock('@tuturuuu/education-core/education/access', async () =>
  (await import('@/lib/testing/route-mocks')).educationAccessMock(() => ({
    normalizedWsId: OWN_WS,
    sbAdmin: mocks.admin.client,
  }))
);

function get(setId: string) {
  return GET(
    routeRequest(`/api/v1/workspaces/${OWN_WS}/quiz-sets/${setId}/quizzes`),
    { params: Promise.resolve({ wsId: OWN_WS, setId }) }
  );
}

describe('GET quiz set quizzes', () => {
  beforeEach(() => {
    mocks.admin = createFakeSupabase(
      (call) =>
        resolveScopeLookup(call) ??
        (call.table === 'quiz_set_quizzes'
          ? { data: [OWN_QUIZ], count: 1 }
          : {})
    );
  });

  it('returns 404 for a quiz set in another workspace without reading its quizzes', async () => {
    const response = await get(FOREIGN_SET);

    expect(response.status).toBe(404);
    expect(mocks.admin.tables()).not.toContain('quiz_set_quizzes');
  });

  it('returns the quizzes of a quiz set in the workspace', async () => {
    const response = await get(OWN_SET);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [OWN_QUIZ],
      count: 1,
    });
    const linkRead = mocks.admin.calls.find(
      (call) => call.table === 'quiz_set_quizzes'
    );
    expect(linkRead && eqValue(linkRead, 'workspace_quizzes.ws_id')).toBe(
      OWN_WS
    );
  });

  it('returns 500 when the quiz set lookup fails', async () => {
    mocks.admin = createFakeSupabase(() => ({ error: { message: 'boom' } }));

    const response = await get(OWN_SET);

    expect(response.status).toBe(500);
    expect(mocks.admin.tables()).not.toContain('quiz_set_quizzes');
  });
});
