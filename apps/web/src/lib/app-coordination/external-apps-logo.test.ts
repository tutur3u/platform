import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const LOGO = 'https://cdn.example.net/fysh.png';
const basePayload = {
  allowedWorkspaceIds: ['00000000-0000-0000-0000-000000000001'],
  displayName: 'Fysh',
  enabled: true,
  id: 'fysh',
  origins: ['https://fysh.example'],
};
const save = (logoUrl?: string | null) =>
  upsertExternalApp({
    actorUserId: 'admin-1',
    payload: logoUrl === undefined ? basePayload : { ...basePayload, logoUrl },
  });
const storedLogo = () =>
  mocks.rows.find((row) => row.name === key('logoUrl'))?.value;

describe('external app logo registry field', () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.inserted = [];
    mocks.deleted = [];
  });

  it('stores a public https logo and reads it back', async () => {
    const { app } = await save(LOGO);
    expect(storedLogo()).toBe(LOGO);
    expect(app.logoUrl).toBe(LOGO);
    expect((await listExternalApps())[0]?.logoUrl).toBe(LOGO);
  });

  it('keeps the stored logo when a save omits it', async () => {
    await save(LOGO);
    mocks.deleted = [];
    const { app } = await save();
    expect(mocks.deleted).not.toContain(key('logoUrl'));
    expect(app.logoUrl).toBe(LOGO);
  });

  it.each([null, '', '   '])('clears the logo on %j', async (value) => {
    await save(LOGO);
    const { app } = await save(value);
    expect(storedLogo()).toBe('');
    expect(app.logoUrl).toBeNull();
  });

  it.each([
    'http://cdn.example.net/fysh.png',
    'https://localhost./fysh.png',
    'javascript:alert(1)',
  ])('refuses to store %s', async (value) => {
    await save(LOGO);
    await expect(save(value)).rejects.toThrow('invalid_logo_url');
    expect(storedLogo()).toBe(LOGO);
  });

  it('reads a tampered stored value as no logo', async () => {
    mocks.rows.push(
      { name: key('displayName'), value: 'Fysh' },
      { name: key('origins'), value: '["https://fysh.example"]' },
      { name: key('logoUrl'), value: 'http://127.0.0.1/x.png' }
    );
    expect((await listExternalApps())[0]?.logoUrl).toBeNull();
  });
});
