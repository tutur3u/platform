import { describe, expect, it, vi } from 'vitest';
import {
  checkWorkspaceModules,
  checkWorkspaceQuizSet,
  requireWorkspaceModules,
  requireWorkspaceQuizSet,
} from './quiz-module-access';
import {
  FOREIGN_MODULE,
  FOREIGN_SET,
  OWN_MODULE,
  OWN_SET,
  OWN_WS,
  resolveScopeLookup,
} from './testing/education-scope-fixtures';
import { createFakeSupabase } from './testing/fake-supabase';

vi.mock('@tuturuuu/education-core/education/access', () => ({
  requireEducationWorkspaceAccess: vi.fn(),
}));

function scopedClient() {
  return createFakeSupabase((call) => resolveScopeLookup(call) ?? {});
}

describe('quiz set and module workspace scope', () => {
  it('accepts a quiz set from the workspace', async () => {
    const fake = scopedClient();
    await expect(
      checkWorkspaceQuizSet(fake.client, OWN_WS, OWN_SET)
    ).resolves.toBe('ok');
  });

  it('rejects a quiz set from another workspace', async () => {
    const fake = scopedClient();
    await expect(
      checkWorkspaceQuizSet(fake.client, OWN_WS, FOREIGN_SET)
    ).resolves.toBe('not_found');
    const response = await requireWorkspaceQuizSet(
      fake.client,
      OWN_WS,
      FOREIGN_SET
    );
    expect(response?.status).toBe(404);
  });

  it('reports a quiz set lookup failure as 500', async () => {
    const fake = createFakeSupabase(() => ({ error: { message: 'boom' } }));
    const response = await requireWorkspaceQuizSet(
      fake.client,
      OWN_WS,
      OWN_SET
    );
    expect(response?.status).toBe(500);
  });

  it('accepts modules whose course group is in the workspace', async () => {
    const fake = scopedClient();
    await expect(
      checkWorkspaceModules(fake.client, OWN_WS, [OWN_MODULE, OWN_MODULE])
    ).resolves.toBe('ok');
  });

  it('rejects a module whose course group is in another workspace', async () => {
    const fake = scopedClient();
    await expect(
      checkWorkspaceModules(fake.client, OWN_WS, [OWN_MODULE, FOREIGN_MODULE])
    ).resolves.toBe('not_found');
    const response = await requireWorkspaceModules(fake.client, OWN_WS, [
      FOREIGN_MODULE,
    ]);
    expect(response?.status).toBe(404);
  });

  it('rejects a missing module', async () => {
    const fake = scopedClient();
    await expect(
      checkWorkspaceModules(fake.client, OWN_WS, [
        '99999999-9999-4999-8999-999999999999',
      ])
    ).resolves.toBe('not_found');
  });
});
