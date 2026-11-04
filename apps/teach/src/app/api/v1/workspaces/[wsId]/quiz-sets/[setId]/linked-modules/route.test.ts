import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOREIGN_SET,
  OWN_MODULE,
  OWN_SET,
  OWN_WS,
  resolveScopeLookup,
} from '@/lib/testing/education-scope-fixtures';
import { createFakeSupabase, eqValue } from '@/lib/testing/fake-supabase';
import { routeRequest } from '@/lib/testing/route-mocks';
import { GET } from './route';

const LINKED_MODULE = { id: OWN_MODULE, name: 'Own module' };

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
    routeRequest(
      `/api/v1/workspaces/${OWN_WS}/quiz-sets/${setId}/linked-modules`
    ),
    { params: Promise.resolve({ wsId: OWN_WS, setId }) }
  );
}

describe('GET quiz set linked modules', () => {
  beforeEach(() => {
    mocks.admin = createFakeSupabase(
      (call) =>
        resolveScopeLookup(call) ??
        (call.table === 'course_module_quiz_sets'
          ? { data: [LINKED_MODULE], count: 1 }
          : {})
    );
  });

  it('returns 404 for a quiz set in another workspace without reading its links', async () => {
    const response = await get(FOREIGN_SET);

    expect(response.status).toBe(404);
    expect(mocks.admin.tables()).not.toContain('course_module_quiz_sets');
  });

  it('returns only workspace modules linked to a workspace quiz set', async () => {
    const response = await get(OWN_SET);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [LINKED_MODULE],
      count: 1,
    });
    const linkRead = mocks.admin.calls.find(
      (call) => call.table === 'course_module_quiz_sets'
    );
    expect(
      linkRead &&
        eqValue(
          linkRead,
          'workspace_course_modules.workspace_user_groups.ws_id'
        )
    ).toBe(OWN_WS);
  });
});
