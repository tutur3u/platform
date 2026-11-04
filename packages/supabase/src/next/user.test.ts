import { describe, expect, it, vi } from 'vitest';
import type { TypedSupabaseClient } from '../types';
import { getVerifiedAuthEmail, getVerifiedAuthUser } from './user';

function admin(user: unknown, error: unknown = null) {
  return {
    auth: {
      admin: { getUserById: vi.fn(async () => ({ data: { user }, error })) },
    },
  } as unknown as TypedSupabaseClient;
}

describe('verified Auth email', () => {
  it('normalizes only the confirmed Auth mailbox', async () => {
    expect(
      await getVerifiedAuthEmail(
        admin({
          id: 'actor',
          email: ' User@Example.com ',
          email_confirmed_at: '2026-01-01',
        }),
        'actor'
      )
    ).toBe('user@example.com');
  });
  it.each([null, undefined, ''])(
    'does not authorize an unconfirmed mailbox',
    async (email_confirmed_at) => {
      expect(
        await getVerifiedAuthEmail(
          admin({ id: 'actor', email: 'user@example.com', email_confirmed_at }),
          'actor'
        )
      ).toBeNull();
    }
  );
  it.each([
    null,
    {
      id: 'other',
      email: 'user@example.com',
      email_confirmed_at: '2026-01-01',
    },
  ])('fails closed for missing or mismatched subject', async (user) => {
    await expect(getVerifiedAuthEmail(admin(user), 'actor')).rejects.toThrow(
      'AUTH_IDENTITY_LOOKUP_FAILED'
    );
  });
  it('fails closed for provider errors without exposing their details', async () => {
    await expect(
      getVerifiedAuthEmail(admin(null, new Error('private error')), 'actor')
    ).rejects.toThrow('AUTH_IDENTITY_LOOKUP_FAILED');
  });
});

describe('current Auth user', () => {
  it('retains authoritative provider identities for the matching subject', async () => {
    const user = {
      id: 'actor',
      email: 'staff@tuturuuu.com',
      email_confirmed_at: '2026-01-01',
      identities: [{ provider: 'azure', identity_data: { tid: 'synthetic' } }],
    };
    expect(await getVerifiedAuthUser(admin(user), 'actor')).toBe(user);
  });
  it.each([null, { id: 'other' }])(
    'fails closed for an absent or mismatched subject',
    async (user) => {
      expect(await getVerifiedAuthUser(admin(user), 'actor')).toBeNull();
    }
  );
  it('fails closed for a rejected lookup', async () => {
    expect(
      await getVerifiedAuthUser(admin(null, new Error('private')), 'actor')
    ).toBeNull();
    const client = admin(null);
    client.auth.admin.getUserById = vi
      .fn()
      .mockRejectedValue(new Error('private'));
    expect(await getVerifiedAuthUser(client, 'actor')).toBeNull();
  });
});
