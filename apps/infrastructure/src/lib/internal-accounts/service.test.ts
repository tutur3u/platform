import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { describe, expect, it, vi } from 'vitest';
import {
  type InternalAccountAdminError,
  listInternalAccountUsers,
  mutateInternalAccount,
  toInternalAccount,
} from './service';

function authUser(overrides: Partial<SupabaseUser> = {}): SupabaseUser {
  return {
    app_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
    id: 'user-1',
    user_metadata: {},
    ...overrides,
  } as SupabaseUser;
}

function adminClient(
  authAdmin: Record<string, unknown>,
  extras: Record<string, unknown> = {}
) {
  return {
    auth: { admin: authAdmin },
    ...extras,
  } as unknown as SupabaseClient<Database>;
}

function listingData() {
  const from = vi.fn((table: string) => {
    if (table === 'users') {
      return {
        select: vi.fn(() => ({
          in: vi.fn().mockResolvedValue({
            data: [
              {
                display_name: 'Local Operator',
                handle: 'local',
                id: 'local-user',
              },
            ],
            error: null,
          }),
        })),
      };
    }

    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        })),
      })),
    };
  });
  return { from, rpc: vi.fn() };
}

describe('internal account service', () => {
  it('only exposes exact Tuturuuu email accounts', () => {
    expect(
      toInternalAccount(authUser({ email: 'operator@tuturuuu.com' }), 'actor-1')
        ?.email
    ).toBe('operator@tuturuuu.com');
    expect(
      toInternalAccount(
        authUser({ email: 'operator@sub.tuturuuu.com' }),
        'actor-1'
      )
    ).toBeNull();
    expect(
      toInternalAccount(
        authUser({ email: 'operator@tuturuuu.com.example' }),
        'actor-1'
      )
    ).toBeNull();
  });

  it('filters the auth directory without returning external users', async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: {
        nextPage: null,
        users: [
          authUser({
            email: 'local@tuturuuu.com',
            email_confirmed_at: '2026-01-01T00:00:00.000Z',
            id: 'local-user',
          }),
          authUser({ email: 'customer@example.com', id: 'customer-user' }),
        ],
      },
      error: null,
    });

    const result = await listInternalAccountUsers({
      actorUserId: 'actor-1',
      q: 'local',
      sbAdmin: adminClient({ listUsers }, listingData()),
    });

    expect(result.count).toBe(1);
    expect(result.accounts[0]?.email).toBe('local@tuturuuu.com');
    expect(result.accounts[0]?.displayName).toBe('Local Operator');
    expect(result.accounts[0]?.username).toBe('local');
    expect(result.nextCursor).toBeNull();
  });

  it('defaults to active and verified accounts with cursor pagination', async () => {
    const listUsers = vi.fn().mockResolvedValue({
      data: {
        nextPage: null,
        users: [
          authUser({
            email: 'active@tuturuuu.com',
            email_confirmed_at: '2026-01-01T00:00:00.000Z',
            id: 'active-user',
          }),
          authUser({
            banned_until: '2126-01-01T00:00:00.000Z',
            email: 'disabled@tuturuuu.com',
            email_confirmed_at: '2026-01-01T00:00:00.000Z',
            id: 'disabled-user',
          }),
          authUser({ email: 'pending@tuturuuu.com', id: 'pending-user' }),
        ],
      },
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        })),
      };
    });

    const result = await listInternalAccountUsers({
      actorUserId: 'actor-1',
      limit: 1,
      sbAdmin: adminClient({ listUsers }, { from, rpc: vi.fn() }),
    });

    expect(result.accounts.map((account) => account.email)).toEqual([
      'active@tuturuuu.com',
    ]);
    expect(result.count).toBe(1);
    expect(result.nextCursor).toBeNull();
  });

  it('blocks self-service mutations before looking up the target', async () => {
    const getUserById = vi.fn();

    await expect(
      mutateInternalAccount({
        action: 'disable_access',
        actorUserId: 'actor-1',
        confirmationEmail: 'actor@tuturuuu.com',
        sbAdmin: adminClient({ getUserById }),
        targetUserId: 'actor-1',
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<InternalAccountAdminError>>({
        status: 409,
      })
    );
    expect(getUserById).not.toHaveBeenCalled();
  });

  it('requires exact email confirmation and applies a bounded disable', async () => {
    const target = authUser({
      email: 'local@tuturuuu.com',
      id: 'local-user',
    });
    const getUserById = vi.fn().mockResolvedValue({
      data: { user: target },
      error: null,
    });
    const updateUserById = vi.fn().mockResolvedValue({
      data: {
        user: { ...target, banned_until: '2126-01-01T00:00:00.000Z' },
      },
      error: null,
    });
    const sbAdmin = adminClient({ getUserById, updateUserById });

    await expect(
      mutateInternalAccount({
        action: 'disable_access',
        actorUserId: 'actor-1',
        confirmationEmail: 'wrong@tuturuuu.com',
        sbAdmin,
        targetUserId: 'local-user',
      })
    ).rejects.toEqual(expect.objectContaining({ status: 400 }));
    expect(updateUserById).not.toHaveBeenCalled();

    const updated = await mutateInternalAccount({
      action: 'disable_access',
      actorUserId: 'actor-1',
      confirmationEmail: 'LOCAL@TUTURUUU.COM',
      sbAdmin,
      targetUserId: 'local-user',
    });

    expect(updateUserById).toHaveBeenCalledWith('local-user', {
      ban_duration: '876000h',
    });
    expect(updated.isDisabled).toBe(true);
  });

  it('updates a public profile without blocking the acting user', async () => {
    const target = authUser({
      email: 'local@tuturuuu.com',
      id: 'local-user',
    });
    const getUserById = vi.fn().mockResolvedValue({
      data: { user: target },
      error: null,
    });
    const deleteHandle = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: { handle: 'old' }, error: null }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        };
      }
      return {
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({ eq: deleteHandle })),
        })),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    });

    const updated = await mutateInternalAccount({
      action: 'update_profile',
      actorUserId: 'local-user',
      displayName: 'Local Operator',
      sbAdmin: adminClient({ getUserById }, { from }),
      targetUserId: 'local-user',
      username: 'operator',
    });

    expect(updated.displayName).toBe('Local Operator');
    expect(updated.username).toBe('operator');
    expect(from).toHaveBeenCalledWith('handles');
  });
});
