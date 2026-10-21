import { checkEnvVariables } from '@tuturuuu/supabase/next/common';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateInternalAccountProfile } from './profile-service';
import { mutateInternalAccount } from './service';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/common', () => ({
  checkEnvVariables: vi.fn(() => ({
    url: 'https://synthetic.supabase.co',
    key: 'synthetic-key',
  })),
}));
vi.mock('./managed-profile-service', () => ({
  updateManagedInternalAccountProfile: vi.fn().mockResolvedValue(null),
}));
const actorUserId = '00000000-0000-4000-8000-000000012001';
const targetUserId = '00000000-0000-4000-8000-000000012002';
const email = 'profile-target@tuturuuu.com';
const profile = {
  actorUserId,
  targetUserId,
  email,
  displayName: ' Changed ',
  username: ' HEHE ',
};

function fixture(previousUsername: string | null = 'old-name') {
  const before = { display_name: 'Original', handle: previousUsername };
  const readProfile = vi.fn().mockResolvedValue({ data: before, error: null });
  const select = vi.fn(() => ({
    eq: vi.fn(() => ({ maybeSingle: readProfile })),
  }));
  // No insert/update/delete methods: every manual write fails this fixture.
  const from = vi.fn((table: string) => {
    if (table !== 'users') throw new Error('Unexpected direct table write');
    return { select };
  });
  const getUserById = vi.fn().mockResolvedValue({
    data: {
      user: {
        id: targetUserId,
        email: ' PROFILE-TARGET@TUTURUUU.COM ',
        banned_until: '2126-01-01T00:00:00Z',
        created_at: '2026-01-01T00:00:00Z',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
      },
    },
    error: null,
  });
  const sbAdmin = {
    from,
    auth: { admin: { getUserById } },
  } as unknown as TypedSupabaseClient;
  let receipt: object | null = null;
  let current = {
    managed: false,
    id: targetUserId,
    email,
    displayName: before.display_name,
    username: previousUsername,
  };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url, options) => {
      const body = JSON.parse(String(options?.body));
      if (String(url).endsWith('/update_unmanaged_internal_profile')) {
        receipt = {
          operationId: body.p_operation_id,
          actorUserId: body.p_actor_id,
          id: body.p_user_id,
          email: body.p_email,
          expectedDisplayName: body.p_expected_name,
          expectedUsername: body.p_expected_handle,
          displayName: body.p_name,
          username: body.p_handle,
        };
        current = {
          ...current,
          displayName: body.p_name,
          username: body.p_handle,
        };
        return Response.json(receipt);
      }
      if (
        !String(url).endsWith('/inspect_unmanaged_internal_profile_operation')
      )
        throw new Error('Unexpected RPC');
      return Response.json({ current, receipt });
    });
  vi.stubGlobal('fetch', fetcher);
  return { before, sbAdmin, readProfile, select, from, fetcher, getUserById };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('legacy profile server wrapper with real shared transport/helper', () => {
  it('reads both preimage fields then performs one atomic RPC and independent inspection', async () => {
    const f = fixture();
    await expect(
      updateInternalAccountProfile({ ...profile, sbAdmin: f.sbAdmin })
    ).resolves.toEqual({ displayName: 'Changed', username: 'hehe' });
    expect(f.from).toHaveBeenCalledExactlyOnceWith('users');
    expect(f.select).toHaveBeenCalledExactlyOnceWith('display_name, handle');
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect(f.readProfile.mock.invocationCallOrder[0]).toBeLessThan(
      f.fetcher.mock.invocationCallOrder[0]!
    );
    expect(checkEnvVariables).toHaveBeenCalledWith({ useSecretKey: true });
    expect(
      JSON.parse(String(f.fetcher.mock.calls[0]?.[1]?.body))
    ).toMatchObject({
      p_actor_id: actorUserId,
      p_user_id: targetUserId,
      p_email: email,
      p_expected_name: 'Original',
      p_expected_handle: 'old-name',
      p_name: 'Changed',
      p_handle: 'hehe',
    });
  });
  it('production mutation binds the actor and authoritative resolved Auth email, including disabled targets', async () => {
    const f = fixture();
    await expect(
      mutateInternalAccount({
        ...profile,
        action: 'update_profile',
        sbAdmin: f.sbAdmin,
      })
    ).resolves.toMatchObject({
      id: targetUserId,
      email,
      isDisabled: true,
      displayName: 'Changed',
      username: 'hehe',
    });
    expect(f.getUserById).toHaveBeenCalledExactlyOnceWith(targetUserId);
    expect(
      JSON.parse(String(f.fetcher.mock.calls[0]?.[1]?.body))
    ).toMatchObject({
      p_actor_id: actorUserId,
      p_user_id: targetUserId,
      p_email: email,
    });
  });
  it('recovers a lost write ACK with no rollback, release, or second write', async () => {
    const f = fixture();
    const database = f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async (url, options) => {
      const response = await database(url, options);
      if (String(url).endsWith('/update_unmanaged_internal_profile'))
        throw new Error('PRIVATE lost reply');
      return response;
    });
    await expect(
      updateInternalAccountProfile({ ...profile, sbAdmin: f.sbAdmin })
    ).resolves.toMatchObject({ username: 'hehe' });
    expect(f.from).toHaveBeenCalledOnce();
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([1, 4, 33, 65, 81, 1001])(
    'allows %i characters without product length bounds',
    async (length) => {
      const f = fixture();
      const username = 'a'.repeat(length);
      await expect(
        updateInternalAccountProfile({
          ...profile,
          username,
          sbAdmin: f.sbAdmin,
        })
      ).resolves.toMatchObject({ username });
      expect(f.fetcher).toHaveBeenCalledTimes(2);
    }
  );
  it.each(['hehe', 'old-name', 'old.name'])(
    'retains unchanged legacy %s',
    async (username) => {
      const f = fixture(username);
      await expect(
        updateInternalAccountProfile({
          ...profile,
          username,
          sbAdmin: f.sbAdmin,
        })
      ).resolves.toMatchObject({ username });
      expect(f.fetcher).toHaveBeenCalledTimes(2);
    }
  );
  it.each([null, '', '  '])('clears with %s', async (username) => {
    const f = fixture();
    await expect(
      updateInternalAccountProfile({ ...profile, username, sbAdmin: f.sbAdmin })
    ).resolves.toMatchObject({ username: null });
    expect(
      JSON.parse(String(f.fetcher.mock.calls[0]?.[1]?.body)).p_handle
    ).toBeNull();
  });
  it.each(['bad-name', '_bad', 'bad.name', 'naïve', 'two words'])(
    'rejects changed invalid %s after the fresh read, before RPC',
    async (username) => {
      const f = fixture();
      await expect(
        updateInternalAccountProfile({
          ...profile,
          username,
          sbAdmin: f.sbAdmin,
        })
      ).rejects.toMatchObject({ status: 400 });
      expect(f.readProfile).toHaveBeenCalledOnce();
      expect(f.fetcher).not.toHaveBeenCalled();
    }
  );
  it('rejects absent display name before reading or writing', async () => {
    const f = fixture();
    await expect(
      updateInternalAccountProfile({
        ...profile,
        displayName: ' ',
        sbAdmin: f.sbAdmin,
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(f.from).not.toHaveBeenCalled();
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it.each(['42501', 'PRIVATE arbitrary code'])(
    'sanitizes preimage read failure %s with zero writes',
    async (code) => {
      const f = fixture();
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      f.readProfile.mockResolvedValueOnce({
        data: null,
        error: { code, message: 'PRIVATE row and key' },
      });
      await expect(
        updateInternalAccountProfile({ ...profile, sbAdmin: f.sbAdmin })
      ).rejects.toMatchObject({ status: 404 });
      expect(log.mock.calls).toEqual([
        [
          'Internal account profile stage failed',
          { stage: 'profile_read', code: code === '42501' ? code : 'unknown' },
        ],
      ]);
      expect(f.fetcher).not.toHaveBeenCalled();
    }
  );
  it('keeps missing profile distinct from completion', async () => {
    const f = fixture();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    f.readProfile.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      updateInternalAccountProfile({ ...profile, sbAdmin: f.sbAdmin })
    ).rejects.toMatchObject({ status: 404 });
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it('sanitizes thrown provider and configuration errors', async () => {
    const f = fixture();
    f.readProfile.mockRejectedValueOnce(new Error('PRIVATE provider'));
    await expect(
      updateInternalAccountProfile({ ...profile, sbAdmin: f.sbAdmin })
    ).rejects.toMatchObject({
      status: 503,
      message: 'Unable to verify the profile update',
    });
    vi.mocked(checkEnvVariables).mockImplementationOnce(() => {
      throw new Error('PRIVATE secret');
    });
    await expect(
      updateInternalAccountProfile({ ...profile, sbAdmin: f.sbAdmin })
    ).rejects.toMatchObject({
      status: 503,
      message: 'Unable to verify the profile update',
    });
    expect(f.fetcher).not.toHaveBeenCalled();
  });
});
