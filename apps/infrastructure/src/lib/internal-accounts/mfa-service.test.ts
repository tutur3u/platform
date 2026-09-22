import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetInternalAccountAuthenticators } from './mfa-service';

const mocks = vi.hoisted(() => ({ coordinate: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/coordination', () => ({
  coordinate: mocks.coordinate,
  coordinationKey: (value: string) => `hashed:${value}`,
}));

function fixture() {
  const getUserById = vi.fn().mockResolvedValue({
    data: { user: { id: 'target', email: 'target@tuturuuu.com' } },
    error: null,
  });
  const updateUserById = vi.fn().mockResolvedValue({ data: {}, error: null });
  const listFactors = vi
    .fn()
    .mockResolvedValueOnce({
      data: { factors: [{ id: 'factor-1' }, { id: 'factor-2' }] },
      error: null,
    })
    .mockResolvedValue({ data: { factors: [] }, error: null });
  const deleteFactor = vi.fn().mockResolvedValue({ data: {}, error: null });
  const input = {
    actorUserId: 'operator',
    targetUserId: 'target',
    confirmationEmail: 'target@tuturuuu.com',
    sbAdmin: {
      auth: {
        admin: {
          getUserById,
          updateUserById,
          mfa: { listFactors, deleteFactor },
        },
      },
    } as unknown as TypedSupabaseClient,
  };
  return { input, getUserById, updateUserById, listFactors, deleteFactor };
}

describe('administrative authenticator reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.coordinate.mockImplementation(
      async ({ action }: { action: string }) => ({
        outcome:
          action === 'acquire'
            ? 'acquired'
            : action === 'check'
              ? 'owned'
              : 'released',
      })
    );
  });

  it('refuses self-reset before acquiring a lease or reading identity', async () => {
    const f = fixture();
    await expect(
      resetInternalAccountAuthenticators({ ...f.input, actorUserId: 'target' })
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.coordinate).not.toHaveBeenCalled();
    expect(f.getUserById).not.toHaveBeenCalled();
  });

  it.each(['external@example.com', 'target@tuturuuu.com.evil.test'])(
    'refuses an out-of-scope target: %s',
    async (email) => {
      const f = fixture();
      f.getUserById.mockResolvedValue({
        data: { user: { id: 'target', email } },
        error: null,
      });
      await expect(
        resetInternalAccountAuthenticators(f.input)
      ).rejects.toMatchObject({ status: 404 });
      expect(f.updateUserById).not.toHaveBeenCalled();
      expect(mocks.coordinate).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'release' })
      );
    }
  );

  it('refuses a provider response for a different identity', async () => {
    const f = fixture();
    f.getUserById.mockResolvedValue({
      data: { user: { id: 'other', email: 'target@tuturuuu.com' } },
      error: null,
    });
    await expect(
      resetInternalAccountAuthenticators(f.input)
    ).rejects.toMatchObject({ status: 404 });
    expect(f.updateUserById).not.toHaveBeenCalled();
  });

  it('requires exact target email confirmation', async () => {
    const f = fixture();
    await expect(
      resetInternalAccountAuthenticators({
        ...f.input,
        confirmationEmail: 'other@tuturuuu.com',
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(f.listFactors).not.toHaveBeenCalled();
  });

  it('serializes with device registration and clears proofs before deleting factors', async () => {
    const f = fixture();
    await resetInternalAccountAuthenticators(f.input);
    expect(mocks.coordinate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'acquire',
        namespace: 'authenticator',
        key: 'hashed:target',
      })
    );
    expect(f.updateUserById).toHaveBeenCalledWith('target', {
      app_metadata: {
        tuturuuu_device_authenticators: {
          version: 1,
          locked: false,
          devices: [],
        },
      },
    });
    expect(f.updateUserById.mock.invocationCallOrder[0]).toBeLessThan(
      f.deleteFactor.mock.invocationCallOrder[0]!
    );
    expect(f.deleteFactor).toHaveBeenNthCalledWith(1, {
      id: 'factor-1',
      userId: 'target',
    });
    expect(f.deleteFactor).toHaveBeenNthCalledWith(2, {
      id: 'factor-2',
      userId: 'target',
    });
    expect(f.listFactors).toHaveBeenCalledTimes(2);
  });

  it('does not mutate without a distributed lease', async () => {
    const f = fixture();
    mocks.coordinate.mockResolvedValue({ outcome: 'busy' });
    await expect(
      resetInternalAccountAuthenticators(f.input)
    ).rejects.toMatchObject({ status: 409 });
    expect(f.getUserById).not.toHaveBeenCalled();
    expect(mocks.coordinate).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the coordination service cannot be reached', async () => {
    const f = fixture();
    mocks.coordinate.mockRejectedValue(new Error('private network details'));
    await expect(
      resetInternalAccountAuthenticators(f.input)
    ).rejects.toMatchObject({
      status: 503,
      message: 'Unable to reset authenticators. Try again.',
    });
    expect(f.getUserById).not.toHaveBeenCalled();
    expect(f.updateUserById).not.toHaveBeenCalled();
  });

  it('stops an operation that exceeds its mutation deadline', async () => {
    const f = fixture();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    f.listFactors.mockReset().mockImplementation(async () => {
      now.mockReturnValue(61_000);
      return { data: { factors: [] }, error: null };
    });
    try {
      await expect(
        resetInternalAccountAuthenticators(f.input)
      ).rejects.toMatchObject({ status: 503 });
      expect(f.updateUserById).not.toHaveBeenCalled();
      expect(f.deleteFactor).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
  });

  it('does not clear device proofs if factor inventory cannot be read', async () => {
    const f = fixture();
    f.listFactors
      .mockReset()
      .mockResolvedValue({ data: null, error: { message: 'provider detail' } });
    await expect(
      resetInternalAccountAuthenticators(f.input)
    ).rejects.toMatchObject({ status: 503 });
    expect(f.updateUserById).not.toHaveBeenCalled();
    expect(f.deleteFactor).not.toHaveBeenCalled();
  });

  it('stops before any mutation after lease ownership is lost', async () => {
    const f = fixture();
    mocks.coordinate.mockImplementation(
      async ({ action }: { action: string }) => ({
        outcome: action === 'acquire' ? 'acquired' : 'expired',
      })
    );
    await expect(
      resetInternalAccountAuthenticators(f.input)
    ).rejects.toMatchObject({ status: 503 });
    expect(f.updateUserById).not.toHaveBeenCalled();
    expect(f.deleteFactor).not.toHaveBeenCalled();
  });

  it('never deletes factors when device proofs could not be cleared', async () => {
    const f = fixture();
    f.updateUserById.mockResolvedValue({
      error: { message: 'private detail' },
    });
    await expect(
      resetInternalAccountAuthenticators(f.input)
    ).rejects.toMatchObject({ status: 503 });
    expect(f.deleteFactor).not.toHaveBeenCalled();
  });

  it('reports partial provider failure without leaking provider detail', async () => {
    const f = fixture();
    f.deleteFactor.mockResolvedValueOnce({
      error: { message: 'private detail' },
    });
    await expect(
      resetInternalAccountAuthenticators(f.input)
    ).rejects.toMatchObject({
      status: 503,
      message: 'Unable to reset authenticators. Try again.',
    });
    expect(f.deleteFactor).toHaveBeenCalledTimes(1);
    expect(mocks.coordinate).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'release' })
    );
  });

  it('does not report success if a concurrent authenticator remains', async () => {
    const f = fixture();
    f.listFactors.mockReset().mockResolvedValue({
      data: { factors: [{ id: 'new-factor' }] },
      error: null,
    });
    await expect(
      resetInternalAccountAuthenticators(f.input)
    ).rejects.toMatchObject({ status: 503 });
  });

  it('does not mask a completed reset if lease release fails', async () => {
    const f = fixture();
    mocks.coordinate.mockImplementation(
      async ({ action }: { action: string }) => {
        if (action === 'release') throw new Error('network unavailable');
        return { outcome: action === 'acquire' ? 'acquired' : 'owned' };
      }
    );
    await expect(
      resetInternalAccountAuthenticators(f.input)
    ).resolves.toBeUndefined();
  });
});
