import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateInternalAccountProfile } from './profile-service';

type FailureStage = 'profile_read' | 'username_reserve' | 'profile_update';

const privateErrorFields = {
  message: 'PRIVATE provider message',
  details: 'PRIVATE database row',
  hint: 'PRIVATE account identity',
};

function fixture({
  failure,
  code = '42501',
  missingProfile = false,
}: {
  failure?: FailureStage;
  code?: string;
  missingProfile?: boolean;
} = {}) {
  const error = { code, ...privateErrorFields };
  const readProfile = vi.fn().mockResolvedValue({
    data: missingProfile ? null : { handle: null },
    error: failure === 'profile_read' ? error : null,
  });
  const reserveUsername = vi.fn().mockResolvedValue({
    error: failure === 'username_reserve' ? error : null,
  });
  const updateProfile = vi.fn(() => ({
    eq: vi.fn().mockResolvedValue({
      error: failure === 'profile_update' ? error : null,
    }),
  }));
  const rollbackOwner = vi.fn().mockResolvedValue({ error: null });
  const rollbackValue = vi.fn(() => ({ eq: rollbackOwner }));
  const deleteUsername = vi.fn(() => ({ eq: rollbackValue }));
  const from = vi.fn((table: string) => {
    if (table === 'users') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: readProfile })),
        })),
        update: updateProfile,
      };
    }
    if (table === 'handles') {
      return { insert: reserveUsername, delete: deleteUsername };
    }
    throw new Error('Unexpected fixture table');
  });
  // Only the external PostgREST boundary is synthetic in this service test.
  const sbAdmin = { from } as unknown as TypedSupabaseClient;
  return {
    sbAdmin,
    reserveUsername,
    updateProfile,
    deleteUsername,
    rollbackValue,
    rollbackOwner,
  };
}

const profile = {
  displayName: ' Synthetic Operator ',
  targetUserId: 'synthetic-target',
  username: ' synthetic_operator ',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('internal profile failure diagnostics', () => {
  it.each([
    { failure: 'profile_read', code: '42501', status: 404 },
    { failure: 'username_reserve', code: '23505', status: 409 },
    { failure: 'username_reserve', code: '23514', status: 500 },
    { failure: 'profile_update', code: '42501', status: 500 },
    { failure: 'profile_update', code: 'PT429', status: 500 },
    { failure: 'profile_update', code: '22023', status: 500 },
  ] satisfies { failure: FailureStage; code: string; status: number }[])(
    'records only $failure and $code while preserving status $status',
    async ({ failure, code, status }) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      const client = fixture({ failure, code });

      await expect(
        updateInternalAccountProfile({ ...profile, sbAdmin: client.sbAdmin })
      ).rejects.toMatchObject({ status });

      expect(log.mock.calls).toEqual([
        ['Internal account profile stage failed', { stage: failure, code }],
      ]);
      if (failure === 'profile_read') {
        expect(client.reserveUsername).not.toHaveBeenCalled();
      }
      if (failure !== 'profile_update') {
        expect(client.updateProfile).not.toHaveBeenCalled();
        expect(client.deleteUsername).not.toHaveBeenCalled();
      } else {
        expect(client.deleteUsername).toHaveBeenCalledOnce();
        expect(client.rollbackValue).toHaveBeenCalledWith(
          'value',
          'synthetic_operator'
        );
        expect(client.rollbackOwner).toHaveBeenCalledWith(
          'creator_id',
          'synthetic-target'
        );
      }
    }
  );

  it('does not log arbitrary provider codes or sensitive error fields', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = fixture({
      failure: 'profile_update',
      code: 'PRIVATE untrusted code',
    });
    await expect(
      updateInternalAccountProfile({ ...profile, sbAdmin: client.sbAdmin })
    ).rejects.toMatchObject({ status: 500 });
    expect(log.mock.calls).toEqual([
      [
        'Internal account profile stage failed',
        { stage: 'profile_update', code: 'unknown' },
      ],
    ]);
  });

  it('keeps a missing profile distinct from a completed update', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = fixture({ missingProfile: true });
    await expect(
      updateInternalAccountProfile({ ...profile, sbAdmin: client.sbAdmin })
    ).rejects.toMatchObject({ status: 404 });
    expect(client.reserveUsername).not.toHaveBeenCalled();
    expect(client.updateProfile).not.toHaveBeenCalled();
    expect(log.mock.calls).toEqual([
      [
        'Internal account profile stage failed',
        { stage: 'profile_read', code: 'unknown' },
      ],
    ]);
  });

  it('preserves the successful write and emits no failure diagnostic', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = fixture();
    await expect(
      updateInternalAccountProfile({ ...profile, sbAdmin: client.sbAdmin })
    ).resolves.toEqual({
      displayName: 'Synthetic Operator',
      username: 'synthetic_operator',
    });
    expect(client.reserveUsername).toHaveBeenCalledWith({
      creator_id: 'synthetic-target',
      value: 'synthetic_operator',
    });
    expect(client.updateProfile).toHaveBeenCalledWith({
      display_name: 'Synthetic Operator',
      handle: 'synthetic_operator',
    });
    expect(client.deleteUsername).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
