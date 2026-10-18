// @vitest-environment node
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  createEmployeeAddressMigrationProvider,
  fingerprintEmployeeAddressMigrationIdentities,
} from './employee-address-migration-provider';

const userId = '11111111-1111-4111-8111-111111111111';
const identityId = '22222222-2222-4222-8222-222222222222';
const sourceAddress = 'employee@legacy.example.com';
const destinationAddress = 'employee@example.com';
const binding = { userId, sourceAddress, destinationAddress };
function user() {
  return {
    id: userId,
    email: sourceAddress,
    email_confirmed_at: '2026-01-01T00:00:00Z',
    is_anonymous: false,
    identities: [
      {
        identity_id: identityId,
        id: userId,
        provider: 'email',
        user_id: userId,
        identity_data: { email: sourceAddress, email_verified: true },
      },
    ],
  };
}
function fixture() {
  let current: unknown = user();
  const order: string[] = [];
  const authorize = vi.fn(async ({ action }: { action: string }) => {
    order.push(`authorize:${action}`);
    return true;
  });
  const admin = {
    getUserById: vi.fn(async () => {
      order.push('read');
      return { data: { user: current }, error: null };
    }),
    updateUserById: vi.fn(
      async (_id: string, attributes: { email: string }) => {
        order.push('update');
        const next = user();
        next.email = attributes.email;
        const identity = next.identities[0];
        if (identity) {
          identity.identity_data.email = attributes.email;
          // Matches GoTrue adminUserUpdate when email_confirm is omitted.
          identity.identity_data.email_verified = false;
        }
        current = next;
        return { data: { user: next }, error: null };
      }
    ),
  };
  return {
    admin,
    authorize,
    order,
    setUser(value: unknown) {
      current = value;
    },
    provider: createEmployeeAddressMigrationProvider({
      admin,
      binding,
      authorize,
    }),
  };
}

describe('stable GoTrue identity fingerprint', () => {
  it('matches the exact compact SQL-compatible tuple bytes', async () => {
    const bytes = `[["${identityId}","email","${userId}"]]`;
    expect(
      await fingerprintEmployeeAddressMigrationIdentities(user().identities)
    ).toBe(createHash('sha256').update(bytes, 'utf8').digest('hex'));
  });

  it('sorts SQL IDs and excludes mutable email, metadata and timestamps', async () => {
    const first = user().identities[0];
    if (!first) throw new Error('Missing fixture identity');
    const second = {
      ...first,
      identity_id: '33333333-3333-4333-8333-333333333333',
      id: 'external-provider-subject',
      provider: 'google',
    };
    const original = await fingerprintEmployeeAddressMigrationIdentities([
      second,
      first,
    ]);
    expect(
      await fingerprintEmployeeAddressMigrationIdentities([
        {
          ...first,
          identity_data: { email: destinationAddress, email_verified: false },
          updated_at: 'later',
        },
        second,
      ])
    ).toBe(original);
    expect(
      await fingerprintEmployeeAddressMigrationIdentities([
        first,
        { ...second, provider: 'github' },
      ])
    ).not.toBe(original);
    expect(
      await fingerprintEmployeeAddressMigrationIdentities([
        first,
        { ...second, identity_id: '44444444-4444-4444-8444-444444444444' },
      ])
    ).not.toBe(original);
    expect(
      await fingerprintEmployeeAddressMigrationIdentities([
        first,
        { ...second, user_id: '44444444-4444-4444-8444-444444444444' },
      ])
    ).not.toBe(original);
  });

  it.each([
    { identities: [] },
    { identities: [{}] },
    { identities: [user().identities[0], user().identities[0]] },
  ])(
    'rejects missing or duplicate identity evidence: %j',
    async ({ identities }) => {
      await expect(
        fingerprintEmployeeAddressMigrationIdentities(identities)
      ).rejects.toThrow();
    }
  );
});

describe('portable employee address migration supplier', () => {
  it('uses the installed Supabase admin transport with one email-only PUT', async () => {
    const requests: { method: string; url: string; body: unknown }[] = [];
    const client = createClient(
      'https://migration-provider.invalid',
      'disposable-test-key',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: async (input, init) => {
            const url = String(input);
            if (
              url !==
              `https://migration-provider.invalid/auth/v1/admin/users/${userId}`
            ) {
              throw new Error('Unexpected fixture URL');
            }
            const method = init?.method ?? 'GET';
            requests.push({
              method,
              url,
              body: init?.body ? JSON.parse(String(init.body)) : null,
            });
            return new Response(JSON.stringify(user()), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          },
        },
      }
    );
    const provider = createEmployeeAddressMigrationProvider({
      admin: client.auth.admin,
      binding,
      authorize: async () => true,
    });
    await provider.read(userId);
    await provider.changeEmail(userId, destinationAddress);
    await expect(
      provider.changeEmail(userId, destinationAddress)
    ).rejects.toThrow();
    expect(requests.map(({ method, body }) => ({ method, body }))).toEqual([
      { method: 'GET', body: null },
      { method: 'GET', body: null },
      { method: 'PUT', body: { email: destinationAddress } },
    ]);
  });

  it('authorizes each independent read and returns the protocol observation', async () => {
    const f = fixture();
    expect(await f.provider.read(userId)).toEqual({
      userId,
      email: sourceAddress,
      active: true,
      emailVerified: true,
      providerIdentityFingerprint:
        await fingerprintEmployeeAddressMigrationIdentities(user().identities),
    });
    await f.provider.read(userId);
    expect(f.order).toEqual([
      'authorize:read',
      'read',
      'authorize:read',
      'read',
    ]);
  });

  it('dispatches exactly {email} once and independently reads the real semantics', async () => {
    const f = fixture();
    const before = await f.provider.read(userId);
    await f.provider.changeEmail(userId, destinationAddress);
    expect(f.admin.updateUserById.mock.calls).toEqual([
      [userId, { email: destinationAddress }],
    ]);
    expect(f.order).toEqual([
      'authorize:read',
      'read',
      'authorize:read',
      'read',
      'authorize:changeEmail',
      'update',
    ]);
    const after = await f.provider.read(userId);
    expect(after).toMatchObject({
      email: destinationAddress,
      emailVerified: false,
    });
    expect(after.providerIdentityFingerprint).toBe(
      before.providerIdentityFingerprint
    );
    await expect(
      f.provider.changeEmail(userId, destinationAddress)
    ).rejects.toThrow();
    expect(f.admin.updateUserById).toHaveBeenCalledTimes(1);
  });

  it('rejects mismatched read target and destination without provider access', async () => {
    const f = fixture();
    await expect(f.provider.read(identityId)).rejects.toThrow();
    await expect(
      f.provider.changeEmail(userId, sourceAddress)
    ).rejects.toThrow();
    await expect(
      f.provider.changeEmail(identityId, destinationAddress)
    ).rejects.toThrow();
    expect(f.admin.getUserById).not.toHaveBeenCalled();
    expect(f.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('requires fresh authorization before any read and before dispatch', async () => {
    const f = fixture();
    f.authorize.mockResolvedValueOnce(false);
    await expect(f.provider.read(userId)).rejects.toThrow();
    expect(f.admin.getUserById).not.toHaveBeenCalled();
    await f.provider.read(userId);
    f.authorize.mockImplementation(
      async ({ action }) => action !== 'changeEmail'
    );
    await expect(
      f.provider.changeEmail(userId, destinationAddress)
    ).rejects.toThrow();
    expect(f.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('does not dispatch without a prior observation', async () => {
    const f = fixture();
    await expect(
      f.provider.changeEmail(userId, destinationAddress)
    ).rejects.toThrow();
    expect(f.admin.updateUserById).not.toHaveBeenCalled();
  });

  it.each([
    { email_confirmed_at: null },
    { email_confirmed_at: '2999-01-01T00:00:00Z' },
    { new_email: destinationAddress },
    {
      identities: user().identities.map((i) => ({
        ...i,
        identity_data: { email: sourceAddress, email_verified: false },
      })),
    },
    {
      identities: user().identities.map((i) => ({
        ...i,
        identity_data: { email: destinationAddress, email_verified: true },
      })),
    },
  ])('fails closed on unverified or pending evidence: %j', async (patch) => {
    const f = fixture();
    f.setUser({ ...user(), ...patch });
    expect((await f.provider.read(userId)).emailVerified).toBe(false);
    await expect(
      f.provider.changeEmail(userId, destinationAddress)
    ).rejects.toThrow();
    expect(f.admin.updateUserById).not.toHaveBeenCalled();
  });

  it.each([
    { deleted_at: '2026-01-01T00:00:00Z' },
    { banned_until: '2999-01-01T00:00:00Z' },
    { is_anonymous: true },
  ])('does not mutate inactive users: %j', async (patch) => {
    const f = fixture();
    f.setUser({ ...user(), ...patch });
    expect((await f.provider.read(userId)).active).toBe(false);
    await expect(
      f.provider.changeEmail(userId, destinationAddress)
    ).rejects.toThrow();
    expect(f.admin.updateUserById).not.toHaveBeenCalled();
  });

  it.each([
    { id: identityId },
    { identities: [] },
    {
      identities: user().identities.map((i) => ({ ...i, user_id: identityId })),
    },
    { banned_until: 'invalid' },
    { email: 'unrelated@example.com' },
  ])('rejects malformed or foreign evidence: %j', async (patch) => {
    const f = fixture();
    f.setUser({ ...user(), ...patch });
    await expect(f.provider.read(userId)).rejects.toThrow();
  });

  it('rejects identity drift between observation and dispatch', async () => {
    const f = fixture();
    await f.provider.read(userId);
    f.setUser({
      ...user(),
      identities: user().identities.map((i) => ({ ...i, identity_id: userId })),
    });
    await expect(
      f.provider.changeEmail(userId, destinationAddress)
    ).rejects.toThrow();
    expect(f.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('permits only one concurrent mutation entry', async () => {
    const f = fixture();
    await f.provider.read(userId);
    const results = await Promise.allSettled([
      f.provider.changeEmail(userId, destinationAddress),
      f.provider.changeEmail(userId, destinationAddress),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    expect(f.admin.updateUserById).toHaveBeenCalledTimes(1);
  });

  it.each(['throw', 'error', 'malformed'])(
    'retains the consumed fence after %s; reads remain available',
    async (failure) => {
      const f = fixture();
      await f.provider.read(userId);
      const admin = {
        getUserById: f.admin.getUserById,
        updateUserById: vi.fn(async () => {
          if (failure === 'throw') throw new Error('Transport outcome unknown');
          return failure === 'error' ? { error: { message: 'denied' } } : {};
        }),
      };
      const provider = createEmployeeAddressMigrationProvider({
        admin,
        binding,
        authorize: f.authorize,
      });
      await provider.read(userId);
      await expect(
        provider.changeEmail(userId, destinationAddress)
      ).rejects.toThrow();
      await expect(
        provider.changeEmail(userId, destinationAddress)
      ).rejects.toThrow();
      await expect(provider.read(userId)).resolves.toMatchObject({
        email: sourceAddress,
      });
      expect(admin.updateUserById).toHaveBeenCalledTimes(1);
    }
  );
});
