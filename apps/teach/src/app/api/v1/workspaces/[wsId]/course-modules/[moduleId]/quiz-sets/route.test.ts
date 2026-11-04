import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOREIGN_MODULE,
  OWN_MODULE,
  OWN_SET,
  OWN_WS,
  resolveScopeLookup,
} from '@/lib/testing/education-scope-fixtures';
import { createFakeSupabase, eqValue } from '@/lib/testing/fake-supabase';
import { routeRequest } from '@/lib/testing/route-mocks';
import { GET } from './route';

const LINKED_SET = { id: OWN_SET, name: 'Own set', ws_id: OWN_WS };

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

function get(moduleId: string, query = '') {
  return GET(
    routeRequest(
      `/api/v1/workspaces/${OWN_WS}/course-modules/${moduleId}/quiz-sets${query}`
    ),
    { params: Promise.resolve({ wsId: OWN_WS, moduleId }) }
  );
}

describe('GET course module quiz sets', () => {
  beforeEach(() => {
    mocks.admin = createFakeSupabase((call) => {
      const scope = resolveScopeLookup(call);
      if (scope) return scope;
      if (call.table !== 'course_module_quiz_sets') return {};
      // PostgREST rejects a filter on a column the link table does not have.
      if (call.ops.some((op) => op.method === 'ilike' && op.args[0] === 'name'))
        return {
          error: {
            message: 'column course_module_quiz_sets.name does not exist',
          },
        };
      return { data: [LINKED_SET], count: 1 };
    });
  });

  it('returns 404 for a module in another workspace without reading its links', async () => {
    const response = await get(FOREIGN_MODULE);

    expect(response.status).toBe(404);
    expect(mocks.admin.tables()).not.toContain('course_module_quiz_sets');
  });

  it('returns only workspace quiz sets linked to a workspace module', async () => {
    const response = await get(OWN_MODULE);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [LINKED_SET],
      count: 1,
    });
    const linkRead = mocks.admin.calls.find(
      (call) => call.table === 'course_module_quiz_sets'
    );
    expect(linkRead && eqValue(linkRead, 'workspace_quiz_sets.ws_id')).toBe(
      OWN_WS
    );
  });

  it('searches by the linked quiz set name', async () => {
    const response = await get(OWN_MODULE, '?q=Own');

    expect(response.status).toBe(200);
    const linkRead = mocks.admin.calls.find(
      (call) => call.table === 'course_module_quiz_sets'
    );
    expect(linkRead?.ops).toContainEqual({
      method: 'ilike',
      args: ['workspace_quiz_sets.name', '%Own%'],
    });
  });
});
