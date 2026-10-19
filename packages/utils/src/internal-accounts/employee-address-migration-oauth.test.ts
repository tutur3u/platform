// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  createEmployeeAddressMigrationProvider,
  fingerprintEmployeeAddressMigrationIdentities,
} from './employee-address-migration-provider';

const userId = '11111111-1111-4111-8111-111111111111';
const googleIdentityId = '22222222-2222-4222-8222-222222222222';
const emailIdentityId = '33333333-3333-4333-8333-333333333333';
const sourceAddress = 'employee@legacy.example.com';
const destinationAddress = 'employee@example.com';
const binding = { userId, sourceAddress, destinationAddress };
function oauthUser() {
  return {
    id: userId,
    email: sourceAddress,
    email_confirmed_at: '2026-01-01T00:00:00Z',
    is_anonymous: false,
    identities: [
      {
        identity_id: googleIdentityId,
        id: 'stable-google-subject',
        user_id: userId,
        provider: 'google',
        identity_data: {
          sub: 'stable-google-subject',
          email: destinationAddress,
          email_verified: true,
        },
      },
    ],
  };
}

describe('OAuth-only legacy migration supplier contract', () => {
  it('admits the confirmed verified OAuth source without an email identity', async () => {
    const admin = {
      getUserById: vi.fn(async () => ({
        data: { user: oauthUser() },
        error: null,
      })),
      updateUserById: vi.fn(),
    };
    const provider = createEmployeeAddressMigrationProvider({
      admin,
      binding,
      authorize: async () => true,
    });
    expect(await provider.read(userId)).toMatchObject({
      email: sourceAddress,
      active: true,
      emailVerified: true,
    });
  });

  it.each([
    'source-claim',
    'unverified',
    'subject-mismatch',
    'extra-identity',
    'unconfirmed',
    'banned',
    'pending-change',
  ])('never confirms a destination from %s evidence', async (mode) => {
    const current = oauthUser();
    const google = current.identities[0];
    if (!google) throw new Error('Missing Google fixture');
    if (mode === 'source-claim') google.identity_data.email = sourceAddress;
    if (mode === 'unverified') google.identity_data.email_verified = false;
    if (mode === 'subject-mismatch')
      google.identity_data.sub = 'different-subject';
    if (mode === 'extra-identity')
      current.identities.push({ ...google, identity_id: emailIdentityId });
    const value = {
      ...current,
      email_confirmed_at:
        mode === 'unconfirmed' ? null : current.email_confirmed_at,
      banned_until: mode === 'banned' ? '2099-01-01T00:00:00Z' : null,
      new_email: mode === 'pending-change' ? destinationAddress : null,
    };
    const admin = {
      getUserById: vi.fn(async () => ({ data: { user: value }, error: null })),
      updateUserById: vi.fn(),
    };
    const provider = createEmployeeAddressMigrationProvider({
      admin,
      binding,
      authorize: async () => true,
    });
    await provider.read(userId);
    await expect(
      provider.changeEmail(userId, destinationAddress)
    ).rejects.toThrow();
    expect(admin.updateUserById).not.toHaveBeenCalled();
  });

  it('uses exactly one confirmed email PUT only for the verified Google destination', async () => {
    const original = oauthUser();
    let current = original;
    const admin = {
      getUserById: vi.fn(async () => ({
        data: { user: current },
        error: null,
      })),
      updateUserById: vi.fn(
        async (
          _id: string,
          attributes: { email: string; email_confirm?: true }
        ) => {
          expect(attributes).toEqual({
            email: destinationAddress,
            email_confirm: true,
          });
          current = {
            ...original,
            email: destinationAddress,
            identities: [
              ...original.identities,
              {
                identity_id: emailIdentityId,
                id: userId,
                user_id: userId,
                provider: 'email',
                identity_data: {
                  sub: userId,
                  email: destinationAddress,
                  email_verified: true,
                },
              },
            ],
          };
          throw new Error('Lost mutation acknowledgement');
        }
      ),
    };
    const provider = createEmployeeAddressMigrationProvider({
      admin,
      binding,
      authorize: async () => true,
    });
    const before = await provider.read(userId);
    await expect(
      provider.changeEmail(userId, destinationAddress)
    ).rejects.toThrow('Lost mutation acknowledgement');
    const after = await provider.read(userId);
    expect(after).toMatchObject({
      email: destinationAddress,
      emailVerified: true,
      active: true,
    });
    expect(after.providerIdentityFingerprint).not.toBe(
      before.providerIdentityFingerprint
    );
    expect(current.identities[0]).toEqual(original.identities[0]);
    await expect(
      provider.changeEmail(userId, destinationAddress)
    ).rejects.toThrow();
    expect(admin.updateUserById).toHaveBeenCalledExactlyOnceWith(userId, {
      email: destinationAddress,
      email_confirm: true,
    });
  });

  it('refuses a Google metadata change on the fresh pre-dispatch read', async () => {
    const original = oauthUser();
    const current = {
      ...original,
      identities: original.identities.map((identity) => ({
        ...identity,
        identity_data: { ...identity.identity_data, name: 'Original' },
      })),
    };
    const admin = {
      getUserById: vi.fn(async () => ({
        data: { user: current },
        error: null,
      })),
      updateUserById: vi.fn(),
    };
    const provider = createEmployeeAddressMigrationProvider({
      admin,
      binding,
      authorize: async () => true,
    });
    await provider.read(userId);
    const google = current.identities[0];
    if (!google) throw new Error('Missing Google fixture');
    google.identity_data.name = 'Changed';
    await expect(
      provider.changeEmail(userId, destinationAddress)
    ).rejects.toThrow();
    expect(admin.updateUserById).not.toHaveBeenCalled();
  });

  it('models the pinned GoTrue email-only mutation without rewriting Google claims', async () => {
    // v2.197.0 internal/api/admin.go:251-284 creates the missing email identity
    // with EmailVerified=params.EmailConfirm (false for an email-only request).
    // This is a transport fixture, not execution of the GoTrue server.
    const before = oauthUser();
    let current = before;
    const requests: { method: string; body: unknown }[] = [];
    const client = createClient(
      'https://migration-provider.invalid',
      'fixture-key',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: {
          fetch: async (input, init) => {
            expect(String(input)).toBe(
              `https://migration-provider.invalid/auth/v1/admin/users/${userId}`
            );
            const method = init?.method ?? 'GET';
            const body: unknown = init?.body
              ? JSON.parse(String(init.body))
              : null;
            requests.push({ method, body });
            if (method === 'PUT') {
              expect(body).toEqual({ email: destinationAddress });
              current = {
                ...before,
                email: destinationAddress,
                identities: [
                  ...before.identities,
                  {
                    identity_id: emailIdentityId,
                    id: userId,
                    user_id: userId,
                    provider: 'email',
                    identity_data: {
                      sub: userId,
                      email: destinationAddress,
                      email_verified: false,
                    },
                  },
                ],
              };
            }
            return Response.json(current);
          },
        },
      }
    );
    const provider = createEmployeeAddressMigrationProvider({
      admin: client.auth.admin,
      binding,
      authorize: async () => true,
    });
    const initial = await provider.read(userId);
    // Direct SDK invocation characterizes the supplier's hypothetical result;
    // the guarded migration provider must not issue this request for this source.
    const changed = await client.auth.admin.updateUserById(userId, {
      email: destinationAddress,
    });
    expect(changed.error).toBeNull();
    const observed = await provider.read(userId);
    expect(current.id).toBe(before.id);
    expect(current.email_confirmed_at).toBe(before.email_confirmed_at);
    expect(current.identities).toHaveLength(2);
    expect(current.identities[0]).toEqual(before.identities[0]);
    expect(current.identities[1]).toMatchObject({
      provider: 'email',
      identity_data: { email: destinationAddress, email_verified: false },
    });
    expect(observed).toMatchObject({
      email: destinationAddress,
      active: true,
      emailVerified: false,
    });
    expect(observed.providerIdentityFingerprint).not.toBe(
      initial.providerIdentityFingerprint
    );
    expect(observed.providerIdentityFingerprint).toBe(
      await fingerprintEmployeeAddressMigrationIdentities(current.identities)
    );
    await expect(
      provider.changeEmail(userId, destinationAddress)
    ).rejects.toThrow();
    expect(requests.map(({ method }) => method)).toEqual([
      'GET',
      'PUT',
      'GET',
      'GET',
    ]);
  });
});
