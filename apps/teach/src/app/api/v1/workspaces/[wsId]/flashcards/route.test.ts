import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOREIGN_MODULE,
  OWN_MODULE,
  OWN_WS,
  resolveScopeLookup,
} from '@/lib/testing/education-scope-fixtures';
import { createFakeSupabase } from '@/lib/testing/fake-supabase';
import { routeRequest } from '@/lib/testing/route-mocks';
import { DELETE, PUT } from './[flashcardId]/route';
import { POST } from './route';

const FLASHCARD_ID = '44444444-4444-4444-8444-444444444444';

type Fake = ReturnType<
  typeof import('@/lib/testing/fake-supabase').createFakeSupabase
>;

const mocks = vi.hoisted(() => ({
  admin: null as unknown as Fake,
  user: null as unknown as Fake,
  linkError: null as unknown,
  permissions: [] as string[],
}));

vi.mock('@/lib/api-auth', async () =>
  (await import('@/lib/testing/route-mocks')).sessionAuthMock(
    () => mocks.user.client
  )
);
vi.mock('@tuturuuu/education-core/education/access', () => ({
  requireEducationWorkspaceAccess: async ({
    permission,
  }: {
    permission: string;
  }) =>
    mocks.permissions.includes(permission)
      ? { normalizedWsId: OWN_WS, sbAdmin: mocks.admin.client }
      : NextResponse.json(
          { message: 'Insufficient permissions' },
          { status: 403 }
        ),
}));

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

describe('workspace flashcard authoring', () => {
  beforeEach(() => {
    mocks.linkError = null;
    mocks.permissions = ['update_user_groups'];
    mocks.admin = createFakeSupabase((call) => resolveScopeLookup(call) ?? {});
    mocks.user = createFakeSupabase((call) => {
      if (call.table === 'course_module_flashcards') {
        return { error: mocks.linkError };
      }
      return { data: { id: FLASHCARD_ID } };
    });
  });

  function mutate(method: 'PUT' | 'DELETE') {
    return (method === 'PUT' ? PUT : DELETE)(
      routeRequest(`/api/v1/workspaces/${OWN_WS}/flashcards/${FLASHCARD_ID}`, {
        method,
        ...(method === 'PUT' && {
          body: JSON.stringify({
            front: 'Updated front',
            back: 'Updated back',
          }),
        }),
      }),
      { params: Promise.resolve({ wsId: OWN_WS, flashcardId: FLASHCARD_ID }) }
    );
  }

  it('denies learner create, update, and delete before touching data', async () => {
    mocks.permissions = ['view_user_groups', 'ai_lab'];

    expect((await post(OWN_MODULE)).status).toBe(403);
    expect((await mutate('PUT')).status).toBe(403);
    expect((await mutate('DELETE')).status).toBe(403);
    expect(mocks.admin.tables()).toEqual([]);
    expect(mocks.user.tables()).toEqual([]);
  });

  it('lets a teacher update and delete workspace flashcards', async () => {
    expect((await mutate('PUT')).status).toBe(200);
    expect((await mutate('DELETE')).status).toBe(200);
    expect(methodsOn(mocks.user, 'workspace_flashcards')).toEqual(
      expect.arrayContaining(['update', 'delete'])
    );
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
