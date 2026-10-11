import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  table: vi.fn(),
  exchange: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  fetch: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn(),
}));
vi.mock('./repository', () => ({
  table: mocks.table,
  exchangeToken: mocks.exchange,
}));
vi.mock('../repository/shared', () => ({
  getAdminClient: async () => ({ from: mocks.from }),
}));

import { seal, unseal } from './crypto';
import { finishOAuth } from './oauth';

const state = 'x'.repeat(43);
const credentials = {
  accessToken: 'fixture-access',
  refreshToken: 'fixture-refresh',
  expiresAt: 12345,
};
let pending: Record<string, unknown> | null;
let member: unknown;
let workspace: unknown;
function request(query = `state=${state}&code=fixture-code`, cookie = state) {
  return new NextRequest(
    `https://mail.example.test/api/v1/mail/connected/callback?${query}`,
    { headers: { cookie: `mail_oauth_state=${cookie}` } }
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MAIL_CONNECTED_ACCOUNTS_KEY', 'a'.repeat(64));
  for (const provider of ['GOOGLE', 'MICROSOFT']) {
    vi.stubEnv(`MAIL_${provider}_CLIENT_ID`, 'client');
    vi.stubEnv(`MAIL_${provider}_CLIENT_SECRET`, 'secret');
    vi.stubEnv(
      `MAIL_${provider}_REDIRECT_URI`,
      'https://mail.example.test/api/v1/mail/connected/callback'
    );
  }
  pending = {
    provider: 'google',
    ws_id: 'personal',
    verifier: seal('fixture-verifier', 'owner'),
  };
  member = { type: 'OWNER' };
  workspace = { personal: true };
  const consumed = {
    delete: () => consumed,
    eq: mocks.eq,
    gt: mocks.gt,
    select: () => consumed,
    maybeSingle: async () => ({ data: pending, error: null }),
  };
  mocks.eq.mockReturnValue(consumed);
  mocks.gt.mockReturnValue(consumed);
  mocks.table.mockImplementation(async (name: string) =>
    name === 'mail_oauth_requests' ? consumed : { upsert: mocks.upsert }
  );
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.from.mockImplementation((name: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({
        data: name === 'workspaces' ? workspace : member,
        error: null,
      }),
    };
    return query;
  });
  mocks.exchange.mockResolvedValue(credentials);
  mocks.fetch.mockResolvedValue(
    new Response(JSON.stringify({ emailAddress: 'User@example.test' }))
  );
  vi.stubGlobal('fetch', mocks.fetch);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it.each(['google', 'microsoft'] as const)(
  'stores encrypted %s credentials only after consuming owner state and rechecking personal membership',
  async (provider) => {
    pending!.provider = provider;
    if (provider === 'microsoft')
      mocks.fetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'provider-id',
            mail: null,
            userPrincipalName: 'User@example.test',
          })
        )
      );
    const result = await finishOAuth(request(), 'owner');
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'owner');
    expect(mocks.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
    expect(mocks.exchange).toHaveBeenCalledWith(
      provider,
      expect.objectContaining({ code_verifier: 'fixture-verifier' })
    );
    const row = mocks.upsert.mock.calls[0]![0];
    expect(row).toMatchObject({
      user_id: 'owner',
      ws_id: 'personal',
      address: 'user@example.test',
      provider,
    });
    expect(unseal(row.credentials, 'owner')).toEqual(credentials);
    expect(() => unseal(row.credentials, 'other')).toThrow();
    expect(result.headers.get('location')).toBe(
      'https://mail.example.test/personal/inbox?connected=1'
    );
    expect(result.headers.get('set-cookie')).toContain(
      'Path=/api/v1/mail/connected'
    );
    expect(result.headers.get('set-cookie')).toContain('Max-Age=0');
  }
);
it('rejects browser state mismatch before touching credentials', async () => {
  await expect(
    finishOAuth(request(undefined, 'z'.repeat(43)), 'owner')
  ).rejects.toMatchObject({ status: 400 });
  expect(mocks.table).not.toHaveBeenCalled();
});
it('rejects replayed, expired or other-owner state before exchanging tokens', async () => {
  pending = null;
  await expect(finishOAuth(request(), 'other')).rejects.toMatchObject({
    status: 400,
  });
  expect(mocks.eq).toHaveBeenCalledWith('user_id', 'other');
  expect(mocks.exchange).not.toHaveBeenCalled();
});
it.each(['member', 'workspace'])(
  'rejects revoked %s access before token exchange',
  async (field) => {
    if (field === 'member') member = null;
    else workspace = { personal: false };
    await expect(finishOAuth(request(), 'owner')).rejects.toMatchObject({
      status: 403,
    });
    expect(mocks.exchange).not.toHaveBeenCalled();
  }
);
it('consumes declined authorization without persisting credentials', async () => {
  await expect(
    finishOAuth(request(`state=${state}&error=access_denied`), 'owner')
  ).rejects.toMatchObject({ status: 409 });
  expect(mocks.exchange).not.toHaveBeenCalled();
  expect(mocks.upsert).not.toHaveBeenCalled();
});
it('rejects a Microsoft profile without a durable mailbox identity', async () => {
  pending!.provider = 'microsoft';
  mocks.fetch.mockResolvedValue(
    new Response(JSON.stringify({ mail: 'me@example.test' }))
  );
  await expect(finishOAuth(request(), 'owner')).rejects.toMatchObject({
    status: 409,
  });
  expect(mocks.upsert).not.toHaveBeenCalled();
});
