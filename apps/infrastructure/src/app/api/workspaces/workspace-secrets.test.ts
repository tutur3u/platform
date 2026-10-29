import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  authUser: vi.fn(),
  permissions: vi.fn(),
  admin: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  in: vi.fn(),
  maybeSingle: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.session,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/supabase/next/user', () => ({
  getVerifiedAuthUser: mocks.authUser,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
}));

vi.mock('@/lib/rate-limit', () => ({
  RATE_LIMIT_SECRET_NAMES: { requests: 'RATE_LIMIT_REQUESTS' },
}));

import { requireExternalAppRegistryAdmin } from '../v1/infrastructure/external-apps/access';
import {
  GET as getRateSecrets,
  PUT as putRateSecrets,
} from '../v1/infrastructure/rate-limits/workspace-secrets/route';
import { DELETE, PUT } from './[wsId]/secrets/[secretId]/route';
import { GET, POST } from './[wsId]/secrets/route';

const context = {
  params: Promise.resolve({ wsId: 'tenant-workspace', secretId: 'secret-id' }),
};
const keys = ['STORAGE_LIMIT_BYTES', 'RATE_LIMIT_REQUESTS', 'ENABLE_AI'];
const methods = ['POST', 'PUT', 'DELETE'] as const;

function grant(
  rootPermission?: string,
  email = 'owner@example.com',
  membershipType: 'MEMBER' | 'GUEST' | null = 'MEMBER'
) {
  mocks.session.mockResolvedValue({ id: 'workspace-creator', email });
  mocks.permissions.mockImplementation(async ({ wsId }) => ({
    membershipType,
    containsPermission: (permission: string) =>
      wsId === ROOT_WORKSPACE_ID
        ? permission === rootPermission
        : permission === 'manage_workspace_secrets',
  }));
}

async function mutate(
  method: (typeof methods)[number],
  name: string,
  rename?: string
) {
  mocks.maybeSingle.mockResolvedValue({
    data: { id: 'secret-id', name },
    error: null,
  });
  const request = new Request(
    'https://infra.example.test/api/workspaces/tenant-workspace/secrets',
    {
      method,
      ...(method === 'DELETE'
        ? {}
        : {
            body: JSON.stringify({ name: rename ?? name, value: '42' }),
          }),
    }
  );
  if (method === 'POST') return POST(request, context);
  if (method === 'PUT') return PUT(request, context);
  return DELETE(request, context);
}

describe('Infrastructure workspace secrets permission boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const query = {
      select: mocks.select,
      eq: mocks.eq,
      order: mocks.order,
      in: mocks.in,
      maybeSingle: mocks.maybeSingle,
      insert: mocks.insert,
      update: mocks.update,
      delete: mocks.delete,
    };
    mocks.admin.mockResolvedValue({ from: mocks.from });
    mocks.from.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.in.mockResolvedValue({ data: [], error: null });
    mocks.order.mockResolvedValue({ data: [], error: null });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.update.mockReturnValue(query);
    mocks.delete.mockReturnValue(query);
    mocks.authUser.mockResolvedValue(null);
    grant();
  });

  for (const method of methods) {
    it.each(keys)(`rejects workspace creators: ${method} %s`, async (key) => {
      expect((await mutate(method, key)).status).toBe(403);
      expect(mocks.admin).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
    });

    for (const permission of [
      'manage_workspace_secrets',
      'manage_workspace_roles',
    ]) {
      it.each(keys)(`allows root ${permission}: ${method} %s`, async (key) => {
        grant(permission);
        expect((await mutate(method, key)).status).toBe(200);
        expect(mocks.permissions).toHaveBeenCalledExactlyOnceWith({
          wsId: ROOT_WORKSPACE_ID,
          user: { id: 'workspace-creator', email: 'owner@example.com' },
        });
        expect(
          mocks[
            method === 'POST'
              ? 'insert'
              : method === 'PUT'
                ? 'update'
                : 'delete'
          ]
        ).toHaveBeenCalledOnce();
        if (method !== 'POST') {
          expect(mocks.eq).toHaveBeenCalledWith('id', 'secret-id');
          expect(mocks.eq).toHaveBeenCalledWith('ws_id', 'tenant-workspace');
        }
      });
    }

    it.each([
      'owner@example.com',
      'owner@xwf.tuturuuu.com',
      'owner@tuturuuu.com.evil.test',
    ])(`requires an employee for managed cron: ${method} %s`, async (email) => {
      grant('manage_workspace_secrets', email);
      mocks.authUser.mockResolvedValue({
        email,
        email_confirmed_at: '2026-10-28T00:00:00Z',
        identities: [{ provider: 'email' }],
      });
      expect((await mutate(method, ' managed_cron_enabled ')).status).toBe(403);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.delete).not.toHaveBeenCalled();
    });

    it(`allows a verified staff root admin to write managed cron: ${method}`, async () => {
      grant('manage_workspace_roles', 'operator@tuturuuu.com');
      mocks.authUser.mockResolvedValue({
        email: 'operator@tuturuuu.com',
        email_confirmed_at: '2026-10-28T00:00:00Z',
        identities: [{ provider: 'email' }],
      });
      expect((await mutate(method, 'MANAGED_CRON_ENABLED')).status).toBe(200);
    });

    it.each([
      { email: 'operator@tuturuuu.com' },
      { email: 'operator@tuturuuu.com', identities: [{ provider: 'email' }] },
      {
        email: 'operator@tuturuuu.com',
        email_confirmed_at: '2026-10-28T00:00:00Z',
      },
      null,
    ])(`denies unverified staff root admins: ${method} %j`, async (user) => {
      grant('manage_workspace_secrets', 'operator@tuturuuu.com');
      mocks.authUser.mockResolvedValue(user);
      expect((await mutate(method, 'MANAGED_CRON_ENABLED')).status).toBe(403);
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.delete).not.toHaveBeenCalled();
    });

    it(`still denies an employee workspace creator: ${method}`, async () => {
      grant(undefined, 'operator@tuturuuu.com');
      expect((await mutate(method, 'MANAGED_CRON_ENABLED')).status).toBe(403);
      expect(mocks.admin).not.toHaveBeenCalled();
    });
  }

  for (const membershipType of ['GUEST', null] as const) {
    for (const permission of [
      'manage_workspace_secrets',
      'manage_workspace_roles',
    ]) {
      it(`denies root ${permission} without MEMBER membership (${membershipType}): every secrets entrypoint`, async () => {
        grant(permission, 'operator@tuturuuu.com', membershipType);
        const request = () => new Request('https://infra.example.test');
        const rateRequest = new Request(
          'https://infra.example.test?wsId=11111111-1111-4111-8111-111111111111'
        );

        for (const method of methods) {
          expect((await mutate(method, 'ENABLE_AI')).status).toBe(403);
        }
        expect((await GET(request(), context)).status).toBe(403);
        expect((await getRateSecrets(rateRequest)).status).toBe(403);
        expect((await requireExternalAppRegistryAdmin(request())).ok).toBe(
          false
        );
        expect(mocks.admin).not.toHaveBeenCalled();
        expect(mocks.from).not.toHaveBeenCalled();
      });
    }
  }

  it('denies secret reads for workspace creators', async () => {
    expect(
      (await GET(new Request('https://infra.example.test'), context)).status
    ).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('allows root secret reads', async () => {
    grant('manage_workspace_secrets');
    expect(
      (await GET(new Request('https://infra.example.test'), context)).status
    ).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith('ws_id', 'tenant-workspace');
  });

  it.each([
    ['STORAGE_LIMIT_BYTES', 'MANAGED_CRON_ENABLED'],
    ['MANAGED_CRON_ENABLED', 'STORAGE_LIMIT_BYTES'],
  ])('guards renames from %s to %s', async (existing, proposed) => {
    grant('manage_workspace_secrets');
    expect((await mutate('PUT', existing, proposed)).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('guards a value-only managed cron update', async () => {
    grant('manage_workspace_secrets');
    mocks.maybeSingle.mockResolvedValue({
      data: { name: 'MANAGED_CRON_ENABLED' },
      error: null,
    });
    const response = await PUT(
      new Request('https://infra.example.test', {
        method: 'PUT',
        body: JSON.stringify({ value: 'true' }),
      }),
      context
    );
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([PUT, DELETE])(
    'fails closed when loading an existing secret fails',
    async (handler) => {
      grant('manage_workspace_secrets');
      mocks.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: 'unavailable' },
      });
      expect(
        (
          await handler(
            new Request('https://infra.example.test', {
              method: 'PUT',
              body: JSON.stringify({ value: 'true' }),
            }),
            context
          )
        ).status
      ).toBe(500);
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.delete).not.toHaveBeenCalled();
    }
  );

  it.each([PUT, DELETE])('returns 404 for missing secrets', async (handler) => {
    grant('manage_workspace_secrets');
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(
      (
        await handler(
          new Request('https://infra.example.test', {
            method: 'PUT',
            body: JSON.stringify({ value: 'true' }),
          }),
          context
        )
      ).status
    ).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
  for (const permission of [
    undefined,
    'manage_workspace_roles',
    'manage_workspace_secrets',
  ]) {
    it(`checks root permissions for external app secrets: ${permission}`, async () => {
      grant(permission);
      const result = await requireExternalAppRegistryAdmin(
        new Request('https://infra.example.test')
      );
      expect(result.ok).toBe(Boolean(permission));
      if (!result.ok) expect(result.response.status).toBe(403);
      expect(mocks.permissions).toHaveBeenCalledWith({
        user: { id: 'workspace-creator', email: 'owner@example.com' },
        wsId: ROOT_WORKSPACE_ID,
      });
      if (!permission) expect(mocks.admin).not.toHaveBeenCalled();
    });

    for (const method of ['GET', 'PUT']) {
      it(
        'checks root permissions for rate-limit secrets: ' +
          method +
          ' ' +
          permission,
        async () => {
          grant(permission);
          const request = new Request(
            'https://infra.example.test?wsId=11111111-1111-4111-8111-111111111111',
            {
              method,
              ...(method === 'PUT'
                ? {
                    body: JSON.stringify({
                      wsId: '11111111-1111-4111-8111-111111111111',
                      secrets: { RATE_LIMIT_REQUESTS: '42' },
                    }),
                  }
                : {}),
            }
          );
          const response = await (method === 'GET'
            ? getRateSecrets(request)
            : putRateSecrets(request));
          expect(response.status).toBe(permission ? 200 : 403);
          if (!permission) {
            expect(mocks.admin).not.toHaveBeenCalled();
            expect(mocks.from).not.toHaveBeenCalled();
          } else if (method === 'PUT') {
            expect(mocks.insert).toHaveBeenCalledWith({
              ws_id: '11111111-1111-4111-8111-111111111111',
              name: 'RATE_LIMIT_REQUESTS',
              value: '42',
            });
          }
        }
      );
    }
  }
});
