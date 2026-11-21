import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  account: vi.fn(),
  update: vi.fn(),
  send: vi.fn(),
  connect: vi.fn(),
  table: vi.fn(),
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: vi.fn(),
}));
vi.mock('../auth', () => ({ resolveMailRouteContext: mocks.auth }));
vi.mock('../route-utils', () => ({
  parseJsonBody: async (request: Request, schema: any) => {
    try {
      const result = schema.safeParse(await request.json());
      return result.success
        ? { ok: true, data: result.data }
        : { ok: false, response: new Response(null, { status: 400 }) };
    } catch {
      return { ok: false, response: new Response(null, { status: 400 }) };
    }
  },
}));
vi.mock('./repository', () => ({
  listAccounts: mocks.list,
  getAccount: mocks.account,
  table: mocks.table,
}));
vi.mock('./messages', () => ({
  updateMessage: mocks.update,
  readMessage: vi.fn(),
  listMessages: vi.fn(),
}));
vi.mock('./send', () => ({
  sendConnectedMessage: mocks.send,
  saveDraft: vi.fn(),
  respondToConnectedInvitation: vi.fn(),
  sendProviderDraft: vi.fn(),
}));
vi.mock('./oauth', () => ({ startOAuth: mocks.connect }));

import { seal } from './crypto';
import { GOOGLE_REVOKE_URL } from './revoke';
import { connectedMailRoute } from './route';

const accountId = '3b83b485-f740-4e43-9966-a9a63b792a9c';
const origin = 'https://mail.example.test';
const request = (method = 'GET', body?: string, source = origin) =>
  new NextRequest(`${origin}/api/v1/workspaces/personal/mail/connected`, {
    method,
    headers: { origin: source, 'Content-Type': 'application/json' },
    ...(body ? { body } : {}),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    ok: true,
    isStaff: false,
    context: { user: { id: 'owner' }, normalizedWsId: 'personal-id' },
  });
  mocks.account.mockResolvedValue({ id: accountId });
  mocks.list.mockResolvedValue([]);
});
describe('connected mail API boundaries', () => {
  it('authorizes connected access separately from managed staff mail and never exposes credentials', async () => {
    const response = await connectedMailRoute(request(), 'personal', []);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(mocks.auth).toHaveBeenCalledWith(
      expect.anything(),
      'personal',
      true
    );
  });
  it('rejects foreign origins before credentials or account side effects', async () => {
    expect(
      (
        await connectedMailRoute(
          request('POST', '{}', 'https://evil.test'),
          'personal',
          ['connect']
        )
      ).status
    ).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it.each(['google', 'microsoft'])(
    'only starts %s OAuth for verified staff',
    async (provider) => {
      const ctx = {
        user: { id: 'owner' },
        normalizedWsId: 'personal-workspace',
      };
      const send = () =>
        connectedMailRoute(
          request('POST', JSON.stringify({ provider })),
          'personal',
          ['connect']
        );
      expect((await send()).status).toBe(403);
      expect(mocks.connect).not.toHaveBeenCalled();

      mocks.auth.mockResolvedValue({ ok: true, isStaff: true, context: ctx });
      mocks.connect.mockResolvedValue(
        Response.json({ authUrl: 'https://provider.example.test' })
      );
      expect((await send()).status).toBe(200);
      expect(mocks.connect).toHaveBeenCalledWith(
        ctx,
        provider,
        expect.any(NextRequest)
      );
    }
  );

  it('propagates authorization denial before provider reads', async () => {
    mocks.auth.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    expect(
      (await connectedMailRoute(request(), 'personal', [accountId, 'messages']))
        .status
    ).toBe(403);
    expect(mocks.account).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON, invalid recipient headers and unknown actions', async () => {
    for (const body of ['{', JSON.stringify({ action: 'permanent_delete' })]) {
      expect(
        (
          await connectedMailRoute(request('POST', body), 'personal', [
            accountId,
            'messages',
            'id',
          ])
        ).status
      ).toBe(400);
    }
    expect(mocks.update).not.toHaveBeenCalled();
    expect(
      (
        await connectedMailRoute(
          request(
            'POST',
            JSON.stringify({ to: ['x@example.test\r\nBcc: y@example.test'] })
          ),
          'personal',
          [accountId, 'send']
        )
      ).status
    ).toBe(400);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe('connected mail disconnect', () => {
  const refreshToken = 'synthetic-refresh-secret';
  const accessToken = 'synthetic-access-secret';
  let events: string[];
  let deleteResult: { error: unknown };
  let warn: ReturnType<typeof vi.spyOn>;
  const disconnect = () =>
    connectedMailRoute(request('DELETE'), 'personal', [accountId]);
  const useAccount = (provider: 'google' | 'microsoft') =>
    mocks.account.mockResolvedValue({
      id: accountId,
      provider,
      user_id: 'owner',
      ws_id: 'personal-id',
      credentials: seal({ accessToken, refreshToken, expiresAt: 0 }, 'owner'),
    });
  beforeEach(() => {
    vi.stubEnv('MAIL_CONNECTED_ACCOUNTS_KEY', 'a'.repeat(64));
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    events = [];
    deleteResult = { error: null };
    const filters: [string, string][] = [];
    const chain = {
      delete: () => {
        events.push('delete');
        return chain;
      },
      eq: (column: string, value: string) => {
        filters.push([column, value]);
        return filters.length === 3 ? Promise.resolve(deleteResult) : chain;
      },
    };
    mocks.table.mockImplementation(async (name: string) => {
      events.push(`table:${name}`);
      return chain;
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('revokes the Google grant before deleting the stored tokens', async () => {
    useAccount('google');
    const fetch = vi.fn().mockImplementation(async () => {
      events.push('revoke');
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal('fetch', fetch);
    const response = await disconnect();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      disconnected: true,
      revoked: true,
    });
    expect(fetch).toHaveBeenCalledWith(
      GOOGLE_REVOKE_URL,
      expect.objectContaining({ method: 'POST' })
    );
    expect(String(fetch.mock.calls[0]?.[1].body)).toBe(
      new URLSearchParams({ token: refreshToken }).toString()
    );
    expect(events).toEqual([
      'revoke',
      'table:mail_connected_accounts',
      'delete',
    ]);
  });

  it.each([
    [
      'rejects the token',
      () => Promise.resolve(new Response(null, { status: 400 })),
    ],
    ['is unreachable', () => Promise.reject(new TypeError('fetch failed'))],
    [
      'times out',
      () => Promise.reject(new DOMException('timed out', 'TimeoutError')),
    ],
  ])('still deletes the account when Google %s', async (_, reply) => {
    useAccount('google');
    vi.stubGlobal('fetch', vi.fn().mockImplementation(reply));
    const response = await disconnect();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      disconnected: true,
      revoked: false,
    });
    expect(events).toContain('delete');
    expect(warn).toHaveBeenCalled();
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(refreshToken);
    expect(logged).not.toContain(accessToken);
  });

  it('deletes Microsoft accounts without calling a provider endpoint', async () => {
    useAccount('microsoft');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const response = await disconnect();
    expect(await response.json()).toEqual({
      disconnected: true,
      revoked: true,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(events).toEqual(['table:mail_connected_accounts', 'delete']);
  });

  it('reports a failed deletion instead of claiming a disconnect', async () => {
    useAccount('microsoft');
    deleteResult = { error: { message: 'db' } };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn());
    const response = await disconnect();
    expect(response.status).toBe(500);
    expect(await response.json()).not.toHaveProperty('disconnected');
  });
});
