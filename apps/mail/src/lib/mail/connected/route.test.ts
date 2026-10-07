import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  account: vi.fn(),
  update: vi.fn(),
  send: vi.fn(),
  connect: vi.fn(),
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
  table: vi.fn(),
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
