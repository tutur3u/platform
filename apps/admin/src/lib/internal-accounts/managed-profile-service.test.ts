import { updateManagedEmployeeProfile } from '@tuturuuu/utils/internal-accounts/employee-managed-profile';
import { expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const actorUserId = '00000000-0000-4000-8000-000000012001';
const targetUserId = '00000000-0000-4000-8000-000000012002';
const operationId = '00000000-0000-4000-8000-000000012020';
const current = {
  managed: true,
  ready: true,
  revision: 0,
  id: targetUserId,
  email: 'profile-target@tuturuuu.com',
  displayName: 'Original',
  username: null,
};
const receipt = {
  operationId,
  actorUserId,
  id: targetUserId,
  email: current.email,
  expectedRevision: 0,
  revision: 1,
  displayName: 'Duyên Dương',
  username: 'duyenduong',
};
function fixture() {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(current))
    .mockResolvedValueOnce(Response.json(receipt))
    .mockResolvedValueOnce(
      Response.json({
        current: {
          ...current,
          revision: 1,
          displayName: receipt.displayName,
          username: receipt.username,
        },
        receipt,
      })
    );
  const authorize = vi.fn().mockResolvedValue(true);
  const input = {
    url: 'https://synthetic.supabase.co',
    key: 'synthetic-key',
    actorUserId,
    targetUserId,
    email: current.email,
    displayName: receipt.displayName,
    username: receipt.username,
    operationId,
    fetch: fetcher,
    authorize,
  };
  return { fetcher, authorize, input };
}
it('verifies a separately committed receipt and all current fields', async () => {
  const f = fixture();
  expect(await updateManagedEmployeeProfile(f.input)).toEqual({
    displayName: receipt.displayName,
    username: receipt.username,
  });
  expect(f.fetcher).toHaveBeenCalledTimes(3);
  const [url, options] = f.fetcher.mock.calls[1]!;
  expect(String(url).endsWith('/rpc/update_employee_profile')).toBe(true);
  expect(JSON.parse(String(options?.body))).toEqual({
    p_actor_id: actorUserId,
    p_user_id: targetUserId,
    p_email: current.email,
    p_expected_revision: 0,
    p_operation_id: operationId,
    p_name: receipt.displayName,
    p_handle: receipt.username,
  });
});
it('returns unmanaged eligibility to the untouched legacy writer', async () => {
  const f = fixture();
  f.fetcher
    .mockReset()
    .mockResolvedValueOnce(Response.json({ managed: false }));
  expect(await updateManagedEmployeeProfile(f.input)).toBeNull();
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it('reads the original operation after a lost acknowledgement without replay', async () => {
  const f = fixture();
  f.fetcher
    .mockReset()
    .mockResolvedValueOnce(Response.json(current))
    .mockRejectedValueOnce(new Error('lost reply'))
    .mockResolvedValueOnce(
      Response.json({
        current: {
          ...current,
          revision: 1,
          displayName: receipt.displayName,
          username: receipt.username,
        },
        receipt,
      })
    );
  expect(await updateManagedEmployeeProfile(f.input)).toEqual({
    displayName: receipt.displayName,
    username: receipt.username,
  });
  expect(f.fetcher).toHaveBeenCalledTimes(3);
});
it.each([
  { key: 'id', value: '00000000-0000-4000-8000-000000012003' },
  { key: 'email', value: 'different-profile@tuturuuu.com' },
  { key: 'displayName', value: 'Different Profile' },
  { key: 'username', value: 'differentprofile' },
  { key: 'revision', value: 2 },
])(
  'rejects committed current $key drift with a 503',
  async ({ key, value }) => {
    const f = fixture();
    f.fetcher
      .mockReset()
      .mockResolvedValueOnce(Response.json(current))
      .mockResolvedValueOnce(Response.json(receipt))
      .mockResolvedValueOnce(
        Response.json({
          current: {
            ...current,
            revision: 1,
            displayName: receipt.displayName,
            username: receipt.username,
            [key]: value,
          },
          receipt,
        })
      );
    await expect(updateManagedEmployeeProfile(f.input)).rejects.toMatchObject({
      status: 503,
    });
    expect(f.fetcher).toHaveBeenCalledTimes(3);
  }
);
it('does not treat rollback JSON as a committed update', async () => {
  const f = fixture();
  f.fetcher
    .mockReset()
    .mockResolvedValueOnce(Response.json(current))
    .mockResolvedValueOnce(
      Response.json(receipt, {
        headers: { 'Preference-Applied': 'tx=rollback' },
      })
    )
    .mockResolvedValueOnce(Response.json({ current, receipt: null }));
  await expect(updateManagedEmployeeProfile(f.input)).rejects.toMatchObject({
    status: 503,
  });
});
it.each([
  ['42501', 403],
  ['23505', 409],
  ['23514', 409],
  ['22023', 400],
  ['PT429', 429],
])('maps %s without exposing database text', async (code, status) => {
  const f = fixture();
  f.fetcher
    .mockReset()
    .mockResolvedValueOnce(Response.json(current))
    .mockResolvedValueOnce(
      Response.json(
        { code, message: 'sensitive synthetic value' },
        { status: 400 }
      )
    )
    .mockResolvedValueOnce(Response.json({ current, receipt: null }));
  await expect(updateManagedEmployeeProfile(f.input)).rejects.toMatchObject({
    status,
  });
});
it('revocation before write prevents mutation', async () => {
  const f = fixture();
  f.authorize.mockReset().mockResolvedValueOnce(true).mockResolvedValue(false);
  await expect(updateManagedEmployeeProfile(f.input)).rejects.toMatchObject({
    status: 403,
  });
  expect(f.fetcher).toHaveBeenCalledTimes(1);
});

it.each(['bad-name', '_bad', 'bad.name', 'naïve', 'two words', 'a\n'])(
  'rejects changed invalid username %s after inspection without write or receipt RPC',
  async (username) => {
    const f = fixture();
    await expect(
      updateManagedEmployeeProfile({ ...f.input, username })
    ).rejects.toMatchObject({ status: 400 });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(String(f.fetcher.mock.calls[0]?.[0])).toContain(
      '/rpc/inspect_employee_profile'
    );
  }
);
it.each([
  'a',
  'abcd',
  'hehe',
  ...[33, 65, 81, 1001].map((length) => 'a'.repeat(length)),
  'a_',
  null,
  'old-name',
])(
  'writes username %s once and verifies an independent receipt',
  async (username) => {
    const f = fixture();
    const before = {
      ...current,
      username:
        username === null
          ? 'old-name'
          : username === 'old-name' || username === 'hehe'
            ? username
            : null,
    };
    const after = { ...receipt, username };
    f.fetcher
      .mockReset()
      .mockResolvedValueOnce(Response.json(before))
      .mockResolvedValueOnce(Response.json(after))
      .mockResolvedValueOnce(
        Response.json({
          current: {
            ...before,
            revision: 1,
            displayName: after.displayName,
            username,
          },
          receipt: after,
        })
      );
    await expect(
      updateManagedEmployeeProfile({ ...f.input, username })
    ).resolves.toEqual({ displayName: after.displayName, username });
    expect(f.fetcher).toHaveBeenCalledTimes(3);
    expect(
      JSON.parse(String(f.fetcher.mock.calls[1]?.[1]?.body))
    ).toMatchObject({
      p_handle: username,
      p_expected_revision: 0,
      p_operation_id: operationId,
    });
    expect(String(f.fetcher.mock.calls[2]?.[0])).toContain(
      '/rpc/inspect_employee_profile_operation'
    );
  }
);
