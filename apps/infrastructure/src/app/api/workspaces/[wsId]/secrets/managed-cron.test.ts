import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, PUT } from './[secretId]/route';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  write: vi.fn(),
  email: 'admin@example.test',
  verified: true,
  existing: 'MANAGED_CRON_ENABLED',
  lookups: [] as Array<Record<string, unknown>>,
  rows: [] as Array<{ id: string; name: string; ws_id: string }>,
}));
vi.mock('@tuturuuu/supabase/next/user', () => ({
  getVerifiedAuthUser: async () =>
    mocks.verified
      ? {
          id: 'actor',
          email: mocks.email,
          email_confirmed_at: '2026-01-01',
          identities: [{ provider: 'email', identity_data: {} }],
        }
      : null,
}));
vi.mock('@/lib/infrastructure-admin-access', () => ({
  authorizeInfrastructureWorkspaceSecretsRequest: async () => {
    const filters: Record<string, unknown> = {};
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return query;
      },
      maybeSingle: async () => {
        mocks.lookups.push({ ...filters });
        const row = mocks.rows.find((candidate) =>
          Object.entries(filters).every(
            ([column, value]) =>
              candidate[column as keyof typeof candidate] === value
          )
        );
        return { data: row ?? null, error: null };
      },
      insert: mocks.write,
      update: mocks.write,
      delete: mocks.write,
    };
    mocks.write.mockReturnValue(query);
    return {
      ok: true,
      user: { id: 'actor', email: mocks.email },
      sbAdmin: { from: () => query },
    };
  },
}));
describe('managed cron secret mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.email = 'admin@example.test';
    mocks.verified = true;
    mocks.existing = 'MANAGED_CRON_ENABLED';
    mocks.lookups = [];
    mocks.rows = [{ id: 'secret', name: mocks.existing, ws_id: 'tenant' }];
  });
  it.each([
    ['create', POST],
    ['update', PUT],
    ['delete', DELETE],
  ] as const)('requires an employee for %s', async (_operation, handler) => {
    const response = await handler(
      new Request('https://example.test/secrets', {
        method: 'POST',
        body: JSON.stringify({
          name: ' managed_cron_enabled ',
          value: 'false',
        }),
      }),
      { params: Promise.resolve({ wsId: 'tenant', secretId: 'secret' }) }
    );
    expect(response.status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('preserves employee mutations', async () => {
    mocks.email = 'employee@tuturuuu.com';
    const response = await POST(
      new Request('https://example.test/secrets', {
        method: 'POST',
        body: JSON.stringify({ name: 'MANAGED_CRON_ENABLED', value: 'false' }),
      }),
      { params: Promise.resolve({ wsId: 'tenant' }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.write).toHaveBeenCalled();
  });
  it('rejects an employee email without a verified Auth user', async () => {
    mocks.email = 'employee@tuturuuu.com';
    mocks.verified = false;
    const response = await POST(
      new Request('https://example.test/secrets', {
        method: 'POST',
        body: JSON.stringify({ name: 'MANAGED_CRON_ENABLED', value: 'false' }),
      }),
      { params: Promise.resolve({ wsId: 'tenant' }) }
    );
    expect(response.status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('checks the existing name when renaming a managed setting', async () => {
    const response = await PUT(
      new Request('https://example.test/secrets', {
        method: 'PUT',
        body: JSON.stringify({ name: 'OTHER_SETTING' }),
      }),
      { params: Promise.resolve({ wsId: 'tenant', secretId: 'secret' }) }
    );
    expect(response.status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('rejects renaming a normal secret into the managed setting', async () => {
    mocks.rows = [{ id: 'secret', name: 'OTHER_SETTING', ws_id: 'tenant' }];
    const response = await PUT(
      new Request('https://example.test/secrets', {
        method: 'PUT',
        body: JSON.stringify({ name: ' managed_cron_enabled ' }),
      }),
      { params: Promise.resolve({ wsId: 'tenant', secretId: 'secret' }) }
    );
    expect(response.status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('allows an employee to rename a normal secret into the managed setting', async () => {
    mocks.email = 'employee@tuturuuu.com';
    mocks.rows = [{ id: 'secret', name: 'OTHER_SETTING', ws_id: 'tenant' }];
    const response = await PUT(
      new Request('https://example.test/secrets', {
        method: 'PUT',
        body: JSON.stringify({ name: 'MANAGED_CRON_ENABLED' }),
      }),
      { params: Promise.resolve({ wsId: 'tenant', secretId: 'secret' }) }
    );
    expect(response.status).toBe(200);
    expect(mocks.write).toHaveBeenCalled();
  });
  it.each([
    ['PUT', PUT],
    ['DELETE', DELETE],
  ] as const)(
    'binds the %s lookup to the workspace and secret id',
    async (_operation, handler) => {
      mocks.rows = [
        { id: 'secret', name: 'OTHER_SETTING', ws_id: 'other-tenant' },
      ];
      const response = await handler(
        new Request('https://example.test/secrets', {
          method: 'PUT',
          body: JSON.stringify({ name: 'MANAGED_CRON_ENABLED' }),
        }),
        { params: Promise.resolve({ wsId: 'tenant', secretId: 'secret' }) }
      );
      expect(mocks.lookups).toEqual([{ id: 'secret', ws_id: 'tenant' }]);
      expect(response.status).toBe(404);
      expect(mocks.write).not.toHaveBeenCalled();
    }
  );
});
