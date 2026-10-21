import { updateUnmanagedEmployeeProfile } from '@tuturuuu/utils/internal-accounts/employee-unmanaged-profile';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const actorUserId = '00000000-0000-4000-8000-000000012001';
const targetUserId = '00000000-0000-4000-8000-000000012002';
const operationId = '00000000-0000-4000-8000-000000012020';
const email = 'profile-target@tuturuuu.com';
const profile = {
  actorUserId,
  targetUserId,
  email,
  operationId,
  expectedDisplayName: 'Original',
  expectedUsername: 'old-name',
  displayName: 'Changed',
  username: 'hehe',
};
const receipt = {
  operationId,
  actorUserId,
  id: targetUserId,
  email,
  expectedDisplayName: profile.expectedDisplayName,
  expectedUsername: profile.expectedUsername,
  displayName: profile.displayName,
  username: profile.username,
};
const current = {
  managed: false,
  id: targetUserId,
  email,
  displayName: profile.displayName,
  username: profile.username,
};
function fixture() {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(receipt))
    .mockResolvedValueOnce(Response.json({ current, receipt }));
  const authorize = vi.fn().mockResolvedValue(true);
  return {
    fetcher,
    authorize,
    input: {
      ...profile,
      url: 'https://synthetic.supabase.co',
      key: 'synthetic-key',
      fetch: fetcher,
      authorize,
    },
  };
}
const failure = { status: 503, message: 'Unable to verify the profile update' };

describe('unmanaged profile atomic write and original-operation observation', () => {
  it('binds the complete identity, fresh preimage and desired payload to one write', async () => {
    const f = fixture();
    await expect(updateUnmanagedEmployeeProfile(f.input)).resolves.toEqual({
      displayName: 'Changed',
      username: 'hehe',
    });
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    const [url, options] = f.fetcher.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://synthetic.supabase.co/rest/v1/rpc/update_unmanaged_internal_profile'
    );
    expect(JSON.parse(String(options?.body))).toEqual({
      p_actor_id: actorUserId,
      p_user_id: targetUserId,
      p_email: email,
      p_operation_id: operationId,
      p_expected_name: 'Original',
      p_expected_handle: 'old-name',
      p_name: 'Changed',
      p_handle: 'hehe',
    });
    const [readUrl, readOptions] = f.fetcher.mock.calls[1]!;
    expect(String(readUrl)).toContain(
      '/rpc/inspect_unmanaged_internal_profile_operation'
    );
    expect(JSON.parse(String(readOptions?.body))).toEqual({
      p_actor_id: actorUserId,
      p_user_id: targetUserId,
      p_email: email,
      p_operation_id: operationId,
    });
    expect(options).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
    });
    expect(f.authorize.mock.calls).toEqual([[actorUserId], [actorUserId]]);
  });
  it('recovers a lost ACK through exactly one original-operation inspection', async () => {
    const f = fixture();
    f.fetcher
      .mockReset()
      .mockRejectedValueOnce(new Error('PRIVATE lost ACK'))
      .mockResolvedValueOnce(Response.json({ current, receipt }));
    await expect(
      updateUnmanagedEmployeeProfile(f.input)
    ).resolves.toMatchObject({ username: 'hehe' });
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(String(f.fetcher.mock.calls[1]?.[1]?.body)).p_operation_id
    ).toBe(operationId);
  });
  it('retains one generated UUID when the caller does not supply one', async () => {
    const f = fixture();
    let original: string | undefined;
    f.fetcher.mockReset().mockImplementation(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      if (original === undefined) {
        original = body.p_operation_id;
        throw new Error('lost ACK');
      }
      expect(body.p_operation_id).toBe(original);
      return Response.json({
        current,
        receipt: { ...receipt, operationId: original },
      });
    });
    await expect(
      updateUnmanagedEmployeeProfile({ ...f.input, operationId: undefined })
    ).resolves.toMatchObject({ username: 'hehe' });
    expect(original).toMatch(/^[a-f0-9-]{36}$/);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(['ack', 'lost', 'rollback'])(
    'requires an independent receipt after %s even when current matches',
    async (mode) => {
      const f = fixture();
      f.fetcher.mockReset();
      if (mode === 'lost')
        f.fetcher.mockRejectedValueOnce(new Error('lost ACK'));
      else
        f.fetcher.mockResolvedValueOnce(
          Response.json(
            receipt,
            mode === 'rollback'
              ? { headers: { 'Preference-Applied': 'tx=rollback' } }
              : undefined
          )
        );
      f.fetcher.mockResolvedValueOnce(
        Response.json({ current, receipt: null })
      );
      await expect(
        updateUnmanagedEmployeeProfile(f.input)
      ).rejects.toMatchObject(failure);
      expect(f.fetcher).toHaveBeenCalledTimes(2);
    }
  );
  it.each([
    ['operationId', '00000000-0000-4000-8000-000000012021'],
    ['actorUserId', targetUserId],
    ['id', actorUserId],
    ['email', 'other@tuturuuu.com'],
    ['expectedDisplayName', null],
    ['expectedUsername', null],
    ['displayName', 'Other'],
    ['username', 'other'],
  ])('rejects receipt %s mismatch', async (key, value) => {
    const f = fixture();
    f.fetcher
      .mockReset()
      .mockResolvedValueOnce(Response.json(receipt))
      .mockResolvedValueOnce(
        Response.json({ current, receipt: { ...receipt, [key]: value } })
      );
    await expect(updateUnmanagedEmployeeProfile(f.input)).rejects.toMatchObject(
      failure
    );
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([
    ['managed', true],
    ['id', actorUserId],
    ['email', 'other@tuturuuu.com'],
    ['displayName', null],
    ['username', 'other'],
  ])('rejects current %s drift or managed target', async (key, value) => {
    const f = fixture();
    f.fetcher
      .mockReset()
      .mockResolvedValueOnce(Response.json(receipt))
      .mockResolvedValueOnce(
        Response.json({ current: { ...current, [key]: value }, receipt })
      );
    await expect(updateUnmanagedEmployeeProfile(f.input)).rejects.toMatchObject(
      failure
    );
  });
  it.each([
    ['42501', 403],
    ['23505', 409],
    ['23514', 409],
    ['22023', 400],
    ['PT429', 429],
    ['PGRST205', 503],
    ['PRIVATE code', 503],
  ])(
    'maps %s with no provider text disclosure or replay',
    async (code, status) => {
      const f = fixture();
      f.fetcher
        .mockReset()
        .mockResolvedValueOnce(
          Response.json({ code, message: 'PRIVATE key/value' }, { status: 400 })
        )
        .mockResolvedValueOnce(Response.json({ current, receipt: null }));
      const result = updateUnmanagedEmployeeProfile(f.input);
      await expect(result).rejects.toMatchObject({ status });
      await expect(result).rejects.not.toHaveProperty(
        'message',
        expect.stringContaining('PRIVATE')
      );
      expect(f.fetcher).toHaveBeenCalledTimes(2);
    }
  );
  it('rejects inspection transport failure without a retry', async () => {
    const f = fixture();
    f.fetcher
      .mockReset()
      .mockResolvedValueOnce(Response.json(receipt))
      .mockRejectedValueOnce(new Error('PRIVATE inspect'));
    await expect(updateUnmanagedEmployeeProfile(f.input)).rejects.toMatchObject(
      failure
    );
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it('prevents dispatch after actor denial and prevents disclosure after revocation', async () => {
    const f = fixture();
    f.authorize.mockResolvedValue(false);
    await expect(updateUnmanagedEmployeeProfile(f.input)).rejects.toMatchObject(
      { status: 403 }
    );
    expect(f.fetcher).not.toHaveBeenCalled();
    f.authorize
      .mockReset()
      .mockResolvedValueOnce(true)
      .mockResolvedValue(false);
    await expect(updateUnmanagedEmployeeProfile(f.input)).rejects.toMatchObject(
      { status: 403 }
    );
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });
  it.each(['bad-name', '_bad', 'bad.name', 'naïve', 'two words', 'a\n'])(
    'rejects changed invalid %s with zero dispatches',
    async (username) => {
      const f = fixture();
      await expect(
        updateUnmanagedEmployeeProfile({ ...f.input, username })
      ).rejects.toMatchObject({ status: 400 });
      expect(f.fetcher).not.toHaveBeenCalled();
    }
  );
  it.each([
    { actorUserId: 'bad' },
    { targetUserId: 'bad' },
    { email: 'bad' },
    { operationId: 'bad' },
    { displayName: ' ' },
  ])(
    'rejects invalid identity or payload %j before dispatch',
    async (change) => {
      const f = fixture();
      await expect(
        updateUnmanagedEmployeeProfile({ ...f.input, ...change })
      ).rejects.toMatchObject({ status: 400 });
      expect(f.fetcher).not.toHaveBeenCalled();
    }
  );
  it.each(['a', 'hehe', 'a'.repeat(1001), 'old-name', null])(
    'accepts unlimited valid syntax, clear, and unchanged legacy %s',
    async (username) => {
      const f = fixture();
      f.fetcher
        .mockReset()
        .mockResolvedValueOnce(Response.json({}))
        .mockResolvedValueOnce(
          Response.json({
            current: { ...current, username },
            receipt: { ...receipt, username },
          })
        );
      await expect(
        updateUnmanagedEmployeeProfile({ ...f.input, username })
      ).resolves.toEqual({ displayName: 'Changed', username });
      expect(f.fetcher).toHaveBeenCalledTimes(2);
    }
  );
  it.each([
    ['42501', 403],
    ['PT429', 429],
    ['PRIVATE', 503],
  ])(
    'maps inspection failure %s without exposing provider details',
    async (code, status) => {
      const f = fixture();
      f.fetcher
        .mockReset()
        .mockResolvedValueOnce(Response.json(receipt))
        .mockResolvedValueOnce(
          Response.json(
            { code, message: 'PRIVATE inspection' },
            { status: 400 }
          )
        );
      await expect(
        updateUnmanagedEmployeeProfile(f.input)
      ).rejects.toMatchObject({ status });
      expect(f.fetcher).toHaveBeenCalledTimes(2);
    }
  );
  it.each([null, {}, { current, receipt: { operationId } }])(
    'sanitizes malformed observation %j',
    async (observation) => {
      const f = fixture();
      f.fetcher
        .mockReset()
        .mockResolvedValueOnce(Response.json(receipt))
        .mockResolvedValueOnce(Response.json(observation));
      await expect(
        updateUnmanagedEmployeeProfile(f.input)
      ).rejects.toMatchObject(failure);
      expect(f.fetcher).toHaveBeenCalledTimes(2);
    }
  );
  it('binds nullable preimages exactly', async () => {
    const f = fixture();
    f.fetcher
      .mockReset()
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(
        Response.json({
          current,
          receipt: {
            ...receipt,
            expectedDisplayName: null,
            expectedUsername: null,
          },
        })
      );
    await expect(
      updateUnmanagedEmployeeProfile({
        ...f.input,
        expectedDisplayName: null,
        expectedUsername: null,
      })
    ).resolves.toMatchObject({ username: 'hehe' });
    expect(
      JSON.parse(String(f.fetcher.mock.calls[0]?.[1]?.body))
    ).toMatchObject({
      p_expected_name: null,
      p_expected_handle: null,
    });
  });
});
