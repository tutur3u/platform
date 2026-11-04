import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOREIGN_MODULE,
  OWN_MODULE,
  OWN_WS,
  resolveScopeLookup,
} from '@/lib/testing/education-scope-fixtures';
import { createFakeSupabase } from '@/lib/testing/fake-supabase';
import { routeRequest } from '@/lib/testing/route-mocks';
import { POST } from './route';

const FLASHCARD_ID = '44444444-4444-4444-8444-444444444444';

type Fake = ReturnType<
  typeof import('@/lib/testing/fake-supabase').createFakeSupabase
>;

const mocks = vi.hoisted(() => ({
  admin: null as unknown as Fake,
  user: null as unknown as Fake,
  linkError: null as unknown,
}));

vi.mock('@/lib/api-auth', async () =>
  (await import('@/lib/testing/route-mocks')).sessionAuthMock(
    () => mocks.user.client
  )
);
vi.mock('@tuturuuu/education-core/education/access', async () =>
  (await import('@/lib/testing/route-mocks')).educationAccessMock(() => ({
    normalizedWsId: OWN_WS,
    sbAdmin: mocks.admin.client,
  }))
);

function post(moduleId?: string) {
  return POST(
    routeRequest(`/api/v1/workspaces/${OWN_WS}/flashcards`, {
      method: 'POST',
      body: JSON.stringify({ front: 'Front', back: 'Back', moduleId }),
    }),
    { params: Promise.resolve({ wsId: OWN_WS }) }
  );
}

function methodsOn(fake: Fake, table: string) {
  return fake.calls
    .filter((call) => call.table === table)
    .flatMap((call) => call.ops.map((op) => op.method));
}

describe('POST workspace flashcards', () => {
  beforeEach(() => {
    mocks.linkError = null;
    mocks.admin = createFakeSupabase((call) => resolveScopeLookup(call) ?? {});
    mocks.user = createFakeSupabase((call) => {
      if (call.table === 'course_module_flashcards') {
        return { error: mocks.linkError };
      }
      return { data: { id: FLASHCARD_ID } };
    });
  });

  it('returns 404 for a module in another workspace without creating a flashcard', async () => {
    const response = await post(FOREIGN_MODULE);

    expect(response.status).toBe(404);
    expect(mocks.user.tables()).toEqual([]);
  });

  it('creates and links a flashcard for a workspace module', async () => {
    const response = await post(OWN_MODULE);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: 'success',
      id: FLASHCARD_ID,
    });
    expect(mocks.user.tables()).toEqual([
      'workspace_flashcards',
      'course_module_flashcards',
    ]);
  });

  it('removes the new flashcard when linking fails', async () => {
    mocks.linkError = { message: 'link failed' };

    const response = await post(OWN_MODULE);

    expect(response.status).toBe(500);
    expect(methodsOn(mocks.user, 'workspace_flashcards')).toContain('delete');
  });
});
