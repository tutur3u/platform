import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isCallbackPath, normalizeCallbackPaths } from './external-apps-utils';

const mocks = vi.hoisted(() => ({
  rows: [] as { name: string; value: string | null }[],
  inserted: [] as { name: string; value: string; ws_id: string }[],
  deleted: [] as string[],
}));

function createDb() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          like: async (_column: string, pattern: string) => ({
            data: mocks.rows.filter((row) =>
              row.name.startsWith(pattern.replace(/%$/u, ''))
            ),
            error: null,
          }),
        }),
      }),
      delete: () => ({
        eq: () => ({
          in: async (_column: string, names: string[]) => {
            mocks.deleted.push(...names);
            mocks.rows = mocks.rows.filter((row) => !names.includes(row.name));
            return { error: null };
          },
        }),
      }),
      insert: async (
        rows: { name: string; value: string; ws_id: string }[]
      ) => {
        mocks.inserted.push(...rows);
        mocks.rows.push(...rows.map(({ name, value }) => ({ name, value })));
        return { error: null };
      },
    }),
  };
}

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => createDb()),
}));

import { listExternalApps, upsertExternalApp } from './external-apps';

const key = (field: string) => `EXTERNAL_APP_REGISTRY:fysh:${field}`;
const basePayload = {
  displayName: 'Fysh',
  enabled: true,
  id: 'fysh',
  origins: ['https://fysh.example'],
};

describe('external app PKCE registry fields', () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.inserted = [];
    mocks.deleted = [];
  });

  it('validates exact callback paths', () => {
    expect(isCallbackPath('/auth/callback')).toBe(true);
    for (const path of [
      'auth/callback',
      '//evil.example/cb',
      '/auth/../cb',
      '/cb?x=1',
      '/cb#x',
      `/${'a'.repeat(512)}`,
    ]) {
      expect(isCallbackPath(path)).toBe(false);
    }
    expect(normalizeCallbackPaths([' /b ', '/a', '/a', 'bad'])).toEqual([
      '/a',
      '/b',
    ]);
  });

  it('defaults legacy apps to origin-only handoffs without PKCE', async () => {
    mocks.rows = [
      { name: key('displayName'), value: 'Fysh' },
      { name: key('origins'), value: '["https://fysh.example"]' },
    ];
    const [app] = await listExternalApps(createDb() as never);
    expect(app).toMatchObject({ callbackPaths: [], requirePkce: false });
  });

  it('reads opted-in PKCE and callback paths', async () => {
    mocks.rows = [
      { name: key('origins'), value: '["https://fysh.example"]' },
      { name: key('requirePkce'), value: 'true' },
      { name: key('callbackPaths'), value: '["/auth/callback","//bad"]' },
    ];
    const [app] = await listExternalApps(createDb() as never);
    expect(app).toMatchObject({
      callbackPaths: ['/auth/callback'],
      requirePkce: true,
    });
  });

  it('writes PKCE fields only when provided and stamps the audit fields', async () => {
    mocks.rows = [
      { name: key('requirePkce'), value: 'true' },
      { name: key('callbackPaths'), value: '["/auth/callback"]' },
    ];
    const { app } = await upsertExternalApp({
      actorUserId: 'root-admin',
      payload: basePayload,
    });
    expect(mocks.deleted).not.toContain(key('requirePkce'));
    expect(mocks.deleted).not.toContain(key('callbackPaths'));
    expect(app).toMatchObject({
      callbackPaths: ['/auth/callback'],
      requirePkce: true,
      updatedBy: 'root-admin',
    });

    const result = await upsertExternalApp({
      actorUserId: 'root-admin',
      payload: { ...basePayload, callbackPaths: [], requirePkce: false },
    });
    expect(result.app).toMatchObject({ callbackPaths: [], requirePkce: false });
    expect(mocks.inserted).toEqual(
      expect.arrayContaining([
        { name: key('requirePkce'), value: 'false', ws_id: ROOT_WORKSPACE_ID },
      ])
    );
  });

  it('refuses invalid callback paths', async () => {
    await expect(
      upsertExternalApp({
        actorUserId: 'root-admin',
        payload: { ...basePayload, callbackPaths: ['https://evil.example/cb'] },
      })
    ).rejects.toThrow('invalid_callback_paths');
    expect(mocks.inserted).toEqual([]);
  });
});
