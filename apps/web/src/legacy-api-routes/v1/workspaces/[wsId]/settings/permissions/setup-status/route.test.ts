import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  defaults: [] as string[],
  roles: [] as { id: string }[],
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: async () => ({ wsId: 'workspace' }),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table === 'workspace_default_permissions') {
        const query = {
          select: () => query,
          eq: (field: string) =>
            field === 'enabled'
              ? Promise.resolve({
                  data: mocks.defaults.map((permission) => ({ permission })),
                  error: null,
                })
              : query,
        };
        return query;
      }
      if (table === 'workspace_roles') {
        const query = {
          select: () => query,
          eq: () => query,
          limit: async () => ({ data: mocks.roles, error: null }),
        };
        return query;
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

async function status() {
  const { GET } = await import('./route');
  const response = await GET(new Request('http://localhost/setup-status'), {
    params: Promise.resolve({ wsId: 'workspace' }),
  });
  return (await response.json()) as { hasConfiguredPermissions: boolean };
}

describe('permission setup status', () => {
  beforeEach(() => {
    mocks.defaults = [];
    mocks.roles = [];
  });

  it('treats the seeded drive and chat defaults as unconfigured', async () => {
    mocks.defaults = [
      'view_drive',
      'manage_drive_tasks_directory',
      'view_chat',
      'create_chat',
    ];
    expect((await status()).hasConfiguredPermissions).toBe(false);
  });

  it('does not count a MEMBER admin default as configured', async () => {
    mocks.defaults = ['admin', 'view_drive'];
    expect((await status()).hasConfiguredPermissions).toBe(false);
  });

  it('counts any other enabled MEMBER default as configured', async () => {
    mocks.defaults = ['view_drive', 'manage_projects'];
    expect((await status()).hasConfiguredPermissions).toBe(true);
  });

  it('counts a workspace role as configured', async () => {
    mocks.defaults = ['admin'];
    mocks.roles = [{ id: 'role-1' }];
    expect((await status()).hasConfiguredPermissions).toBe(true);
  });
});
