import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
}));
vi.mock('../repository/shared', () => ({
  getAdminClient: async () => ({ schema: () => ({ from: mocks.from }) }),
}));

import { seal, unseal } from './crypto';
import {
  accessToken,
  type ConnectedAccount,
  exchangeToken,
  getAccount,
  listAccounts,
} from './repository';

const ctx = { user: { id: 'owner' }, normalizedWsId: 'workspace' } as any;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MAIL_CONNECTED_ACCOUNTS_KEY', 'a'.repeat(64));
  for (const [name, value] of [
    ['MAIL_GOOGLE_CLIENT_ID', 'id'],
    ['MAIL_GOOGLE_CLIENT_SECRET', 'synthetic'],
    ['MAIL_GOOGLE_REDIRECT_URI', 'https://mail.example.test/callback'],
  ])
    vi.stubEnv(name!, value!);
  const chain = {
    eq: mocks.eq,
    select: mocks.select,
    maybeSingle: mocks.maybeSingle,
    update: mocks.update,
  };
  mocks.from.mockReturnValue(chain);
  mocks.eq.mockReturnValue(chain);
  mocks.select.mockReturnValue(chain);
  mocks.update.mockReturnValue(chain);
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('owner scoped connected accounts', () => {
  it('binds account lookup to actor and workspace and hides missing accounts', async () => {
    await expect(getAccount(ctx, 'foreign-account')).rejects.toMatchObject({
      status: 404,
    });
    expect(mocks.eq.mock.calls).toEqual([
      ['id', 'foreign-account'],
      ['user_id', 'owner'],
      ['ws_id', 'workspace'],
    ]);
  });
  it('does not return credentials in account discovery', async () => {
    // The builder projection is the privacy boundary, independently of row content.
    await listAccounts(ctx);
    expect(mocks.select).toHaveBeenCalledWith('id,address,provider');
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'owner');
  });
  it('refreshes expired credentials, preserves an omitted Google refresh token and guards the revision', async () => {
    const account = {
      id: 'one',
      user_id: 'owner',
      provider: 'google',
      revision: 1,
      credentials: seal(
        { accessToken: 'expired', refreshToken: 'refresh', expiresAt: 0 },
        'owner'
      ),
    } as ConnectedAccount;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ access_token: 'new', expires_in: 3600 })
          )
        )
    );
    mocks.maybeSingle.mockResolvedValue({ data: { id: 'one' }, error: null });
    expect(await accessToken(account)).toBe('new');
    const saved = mocks.update.mock.calls[0]?.[0];
    expect(unseal(saved.credentials, 'owner')).toMatchObject({
      accessToken: 'new',
      refreshToken: 'refresh',
    });
    expect(mocks.eq).toHaveBeenCalledWith('revision', 1);
    // Metadata fan-out reuses the refreshed row rather than refreshing each message.
    expect(account.revision).toBe(2);
    expect(await accessToken(account)).toBe('new');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not overwrite a reconnected or disconnected credential', async () => {
    const account = {
      id: 'conflict',
      user_id: 'owner',
      provider: 'google',
      revision: 1,
      credentials: seal(
        { accessToken: 'expired', refreshToken: 'refresh', expiresAt: 0 },
        'owner'
      ),
    } as ConnectedAccount;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ access_token: 'new', expires_in: 3600 })
          )
        )
    );
    await expect(accessToken(account)).rejects.toMatchObject({ status: 409 });
  });
  it('coalesces parallel refreshes and updates every request account snapshot', async () => {
    const first = {
      id: 'parallel',
      user_id: 'owner',
      provider: 'google',
      revision: 3,
      credentials: seal(
        { accessToken: 'expired', refreshToken: 'refresh', expiresAt: 0 },
        'owner'
      ),
    } as ConnectedAccount;
    const second = { ...first };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ access_token: 'new', expires_in: 3600 }))
      );
    vi.stubGlobal('fetch', fetchMock);
    mocks.maybeSingle.mockResolvedValue({
      data: { id: 'parallel' },
      error: null,
    });
    expect(
      await Promise.all([accessToken(first), accessToken(second)])
    ).toEqual(['new', 'new']);
    expect(first.revision).toBe(4);
    expect(second.revision).toBe(4);
    expect(await accessToken(second)).toBe('new');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
  it('uses valid access credentials without contacting the token endpoint', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const account = {
      user_id: 'owner',
      credentials: seal(
        { accessToken: 'valid', expiresAt: Date.now() + 3600000 },
        'owner'
      ),
    } as ConnectedAccount;
    expect(await accessToken(account)).toBe('valid');
    expect(fetch).not.toHaveBeenCalled();
  });
});

it.each([
  'User.Read Mail.ReadWrite Mail.Send',
  'https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send',
  'HTTPS://GRAPH.MICROSOFT.COM/USER.READ\tMail.ReadWrite\nhttps://graph.microsoft.com/Mail.Send',
])(
  'accepts equivalent Microsoft Graph scopes without requiring URI spelling',
  async (scope) => {
    for (const [name, value] of [
      ['MAIL_MICROSOFT_CLIENT_ID', 'id'],
      ['MAIL_MICROSOFT_CLIENT_SECRET', 'synthetic'],
      ['MAIL_MICROSOFT_REDIRECT_URI', 'https://mail.example.test/callback'],
    ])
      vi.stubEnv(name!, value!);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: 'token',
            refresh_token: 'refresh',
            expires_in: 3600,
            scope,
          })
        )
      )
    );
    expect(
      await exchangeToken('microsoft', { grant_type: 'refresh_token' })
    ).toMatchObject({ accessToken: 'token' });
  }
);
it('does not accept a permission for a different Microsoft resource', async () => {
  for (const [name, value] of [
    ['MAIL_MICROSOFT_CLIENT_ID', 'id'],
    ['MAIL_MICROSOFT_CLIENT_SECRET', 'synthetic'],
    ['MAIL_MICROSOFT_REDIRECT_URI', 'https://mail.example.test/callback'],
  ])
    vi.stubEnv(name!, value!);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'token',
          refresh_token: 'refresh',
          expires_in: 3600,
          scope:
            'https://outlook.office.com/User.Read Mail.ReadWrite Mail.Send',
        })
      )
    )
  );
  await expect(
    exchangeToken('microsoft', { grant_type: 'refresh_token' })
  ).rejects.toMatchObject({ status: 409 });
});
it('preserves exact Google URI permission validation', async () => {
  const fetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        access_token: 'token',
        refresh_token: 'refresh',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/gmail.modify',
      })
    )
  );
  vi.stubGlobal('fetch', fetch);
  expect(
    await exchangeToken('google', { grant_type: 'refresh_token' })
  ).toMatchObject({ accessToken: 'token' });
  fetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        access_token: 'token',
        refresh_token: 'refresh',
        expires_in: 3600,
        scope: 'gmail.modify',
      })
    )
  );
  await expect(
    exchangeToken('google', { grant_type: 'refresh_token' })
  ).rejects.toMatchObject({ status: 409 });
});

function conflictAccount(): ConnectedAccount {
  return {
    id: 'cross-instance',
    user_id: 'owner',
    ws_id: 'workspace',
    provider: 'google',
    address: 'synthetic@example.test',
    revision: 7,
    credentials: seal(
      { accessToken: 'expired', refreshToken: 'old', expiresAt: 0 },
      'owner'
    ),
  };
}
function newerCredentials(overrides: Record<string, unknown> = {}) {
  return {
    credentials: seal(
      {
        accessToken: 'winner',
        refreshToken: 'rotated',
        expiresAt: Date.now() + 3600000,
        ...overrides,
      },
      'owner'
    ),
    revision: 8,
  };
}
function refreshResponse() {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ access_token: 'loser', expires_in: 3600 })
        )
      )
  );
}
it('adopts a fresh fenced cross-instance winner without writing it again', async () => {
  const account = conflictAccount();
  const winner = newerCredentials();
  refreshResponse();
  mocks.maybeSingle
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: winner, error: null });
  expect(await accessToken(account)).toBe('winner');
  expect(account.credentials).toBe(winner.credentials);
  expect(account.revision).toBe(8);
  expect(mocks.update).toHaveBeenCalledTimes(1);
  expect(mocks.select).toHaveBeenLastCalledWith('credentials,revision');
  expect(mocks.eq.mock.calls.slice(-4)).toEqual([
    ['id', 'cross-instance'],
    ['user_id', 'owner'],
    ['ws_id', 'workspace'],
    ['provider', 'google'],
  ]);
});
it('does not adopt credentials after a database write error', async () => {
  const account = conflictAccount();
  const original = { ...account };
  refreshResponse();
  mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: {} });
  await expect(accessToken(account)).rejects.toMatchObject({ status: 409 });
  expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
  expect(account).toEqual(original);
});
it.each<[string, () => unknown, unknown]>([
  ['deleted', () => null, null],
  ['read error', () => newerCredentials(), {}],
  ['same revision', () => ({ ...newerCredentials(), revision: 7 }), null],
  ['lower revision', () => ({ ...newerCredentials(), revision: 6 }), null],
  [
    'fractional revision',
    () => ({ ...newerCredentials(), revision: 7.5 }),
    null,
  ],
  ['expired', () => newerCredentials({ expiresAt: 0 }), null],
  ['missing access token', () => newerCredentials({ accessToken: '' }), null],
  ['missing refresh token', () => newerCredentials({ refreshToken: '' }), null],
  ['corrupt', () => ({ credentials: 'corrupt', revision: 8 }), null],
])(
  'rejects the %s winner without changing the account',
  async (_, winner, error) => {
    const account = conflictAccount();
    const original = { ...account };
    refreshResponse();
    mocks.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: winner(), error });
    await expect(accessToken(account)).rejects.toMatchObject({ status: 409 });
    expect(account).toEqual(original);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  }
);
it('does not adopt a token rejected by the provider during forced refresh', async () => {
  const account = conflictAccount();
  const original = { ...account };
  refreshResponse();
  mocks.maybeSingle
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({
      data: newerCredentials({ accessToken: 'expired' }),
      error: null,
    });
  await expect(accessToken(account, true)).rejects.toMatchObject({
    status: 409,
  });
  expect(account).toEqual(original);
});
