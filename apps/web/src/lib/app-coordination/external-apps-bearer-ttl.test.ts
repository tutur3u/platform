import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseMaxBearerTtlSeconds } from './external-apps-utils';

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

describe('external app bearer TTL cap registry field', () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.inserted = [];
    mocks.deleted = [];
  });

  it('parses only whole seconds inside the policy bounds', () => {
    expect(parseMaxBearerTtlSeconds('900')).toBe(900);
    expect(parseMaxBearerTtlSeconds('300')).toBe(300);
    expect(parseMaxBearerTtlSeconds('86400')).toBe(86_400);
    for (const value of ['', null, undefined, '299', '86401', '9e2', '-900']) {
      expect(parseMaxBearerTtlSeconds(value)).toBeNull();
    }
  });

  it('writes the default cap when an app is registered', async () => {
    const { app } = await upsertExternalApp({
      actorUserId: 'root-admin',
      payload: basePayload,
    });

    expect(app.maxBearerTtlSeconds).toBe(900);
    expect(mocks.inserted).toEqual(
      expect.arrayContaining([
        {
          name: key('maxBearerTtlSeconds'),
          value: '900',
          ws_id: ROOT_WORKSPACE_ID,
        },
      ])
    );
  });

  it('keeps a registered app without the field uncapped on later saves', async () => {
    mocks.rows = [
      { name: key('origins'), value: '["https://fysh.example"]' },
      { name: key('enabled'), value: 'true' },
    ];

    const { app } = await upsertExternalApp({
      actorUserId: 'root-admin',
      payload: basePayload,
    });

    expect(app.maxBearerTtlSeconds).toBeNull();
    expect(mocks.deleted).not.toContain(key('maxBearerTtlSeconds'));
  });

  it('lets an existing app opt in, change and clear its cap', async () => {
    mocks.rows = [{ name: key('origins'), value: '["https://fysh.example"]' }];

    const optIn = await upsertExternalApp({
      actorUserId: 'root-admin',
      payload: { ...basePayload, maxBearerTtlSeconds: 900 },
    });
    expect(optIn.app.maxBearerTtlSeconds).toBe(900);

    const kept = await upsertExternalApp({
      actorUserId: 'root-admin',
      payload: basePayload,
    });
    expect(kept.app.maxBearerTtlSeconds).toBe(900);

    const cleared = await upsertExternalApp({
      actorUserId: 'root-admin',
      payload: { ...basePayload, maxBearerTtlSeconds: null },
    });
    expect(cleared.app.maxBearerTtlSeconds).toBeNull();
  });

  it('refuses a cap outside the policy bounds', async () => {
    await expect(
      upsertExternalApp({
        actorUserId: 'root-admin',
        payload: { ...basePayload, maxBearerTtlSeconds: 60 },
      })
    ).rejects.toThrow('invalid_max_bearer_ttl');
    expect(mocks.inserted).toEqual([]);
  });

  it('reads the stored cap', async () => {
    mocks.rows = [
      { name: key('origins'), value: '["https://fysh.example"]' },
      { name: key('maxBearerTtlSeconds'), value: '1800' },
    ];
    const [app] = await listExternalApps(createDb() as never);
    expect(app?.maxBearerTtlSeconds).toBe(1800);
  });
});
