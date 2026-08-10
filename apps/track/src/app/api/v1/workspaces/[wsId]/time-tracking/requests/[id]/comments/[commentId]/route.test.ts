import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  membership: vi.fn(),
  resolveAuth: vi.fn(),
  resolveWorkspaceId: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/constants', () => ({
  MAX_LONG_TEXT_LENGTH: 10_000,
  resolveWorkspaceId: mocks.resolveWorkspaceId,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: mocks.resolveAuth,
}));

import { DELETE, PATCH } from './route';

const WS_ID = '00000000-0000-4000-8000-000000001131';
const REQUEST_ID = '00000000-0000-4000-8000-000000001132';
const COMMENT_ID = '00000000-0000-4000-8000-000000001133';
const USER_ID = '00000000-0000-4000-8000-000000001134';

function params(wsId = WS_ID) {
  return {
    params: Promise.resolve({ wsId, id: REQUEST_ID, commentId: COMMENT_ID }),
  };
}

function request(method: 'PATCH' | 'DELETE') {
  return new Request(`https://track.test/comments/${COMMENT_ID}`, {
    method,
    body:
      method === 'PATCH' ? JSON.stringify({ content: 'Updated' }) : undefined,
    headers:
      method === 'PATCH' ? { 'content-type': 'application/json' } : undefined,
  });
}

function singleQuery(result: unknown, terminal: 'single' | 'maybeSingle') {
  const query: any = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    [terminal]: vi.fn(async () => result),
  };
  return query;
}

function updateQuery(result: unknown) {
  const query: any = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => result),
    update: vi.fn(() => query),
  };
  return query;
}

function deleteQuery(result: unknown) {
  const eq = vi.fn();
  const query: any = {
    delete: vi.fn(() => query),
    eq,
  };
  eq.mockReturnValueOnce(query).mockResolvedValueOnce(result);
  return query;
}

function adminWith(...queries: unknown[]) {
  const from = vi.fn();
  for (const query of queries) from.mockReturnValueOnce(query);
  return {
    admin: { schema: vi.fn(() => ({ from })) },
    from,
  };
}

function recentComment(userId = USER_ID) {
  return {
    created_at: new Date(Date.now() - 60_000).toISOString(),
    user_id: userId,
  };
}

describe('Track request comment workspace boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspaceId.mockReturnValue(WS_ID);
    mocks.resolveAuth.mockResolvedValue({
      ok: true,
      supabase: { name: 'request-scoped-client' },
      user: { id: USER_ID },
    });
    mocks.membership.mockResolvedValue({ ok: true });
  });

  it.each([
    ['PATCH', PATCH],
    ['DELETE', DELETE],
  ] as const)(
    'rejects anonymous %s before admin access',
    async (method, handler) => {
      mocks.resolveAuth.mockResolvedValue({
        ok: false,
        response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
      });
      const req = request(method);
      const jsonSpy = vi.spyOn(req, 'json');

      const response = (await handler(req as never, params()))!;

      expect(response.status).toBe(401);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
      expect(jsonSpy).not.toHaveBeenCalled();
    }
  );

  it('requires the Track app-session target', async () => {
    mocks.resolveAuth.mockResolvedValue({
      ok: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    await DELETE(request('DELETE') as never, params());

    expect(mocks.resolveAuth).toHaveBeenCalledWith(expect.any(Request), {
      allowAppSessionAuth: { targetApp: 'track' },
    });
  });

  it.each([
    ['PATCH', PATCH],
    ['DELETE', DELETE],
  ] as const)(
    'rejects revoked workspace membership before admin access for %s',
    async (method, handler) => {
      mocks.membership.mockResolvedValue({ ok: false });

      const response = (await handler(request(method) as never, params()))!;

      expect(response.status).toBe(403);
      expect(mocks.createAdminClient).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['PATCH', PATCH],
    ['DELETE', DELETE],
  ] as const)(
    'returns 404 for a cross-workspace parent before comment mutation for %s',
    async (method, handler) => {
      const parent = singleQuery({ data: null, error: null }, 'maybeSingle');
      const { admin, from } = adminWith(parent);
      mocks.createAdminClient.mockResolvedValue(admin);
      const req = request(method);
      const jsonSpy = vi.spyOn(req, 'json');

      const response = (await handler(req as never, params()))!;

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: 'Request not found' });
      expect(from).toHaveBeenCalledTimes(1);
      expect(parent.eq).toHaveBeenCalledWith('id', REQUEST_ID);
      expect(parent.eq).toHaveBeenCalledWith('workspace_id', WS_ID);
      expect(jsonSpy).not.toHaveBeenCalled();
    }
  );

  it('normalizes a personal route workspace before membership and parent lookup', async () => {
    const parent = singleQuery(
      { data: { id: REQUEST_ID }, error: null },
      'maybeSingle'
    );
    const comment = singleQuery(
      { data: recentComment(), error: null },
      'single'
    );
    const removed = deleteQuery({ error: null });
    const { admin } = adminWith(parent, comment, removed);
    mocks.createAdminClient.mockResolvedValue(admin);

    const response = await DELETE(
      request('DELETE') as never,
      params('personal')
    );

    expect(response.status).toBe(200);
    expect(mocks.resolveWorkspaceId).toHaveBeenCalledWith('personal');
    expect(mocks.membership).toHaveBeenCalledWith(
      expect.objectContaining({ wsId: WS_ID, userId: USER_ID })
    );
    expect(parent.eq).toHaveBeenCalledWith('workspace_id', WS_ID);
  });

  it.each([
    ['PATCH', PATCH],
    ['DELETE', DELETE],
  ] as const)(
    'preserves ownership denial and performs no mutation for %s',
    async (method, handler) => {
      const parent = singleQuery(
        { data: { id: REQUEST_ID }, error: null },
        'maybeSingle'
      );
      const comment = singleQuery(
        { data: recentComment('another-user'), error: null },
        'single'
      );
      const { admin, from } = adminWith(parent, comment);
      mocks.createAdminClient.mockResolvedValue(admin);

      const response = (await handler(request(method) as never, params()))!;

      expect(response.status).toBe(403);
      expect(from).toHaveBeenCalledTimes(2);
    }
  );

  it.each([
    ['PATCH', PATCH],
    ['DELETE', DELETE],
  ] as const)(
    'preserves the fifteen-minute window and performs no mutation for expired %s',
    async (method, handler) => {
      const parent = singleQuery(
        { data: { id: REQUEST_ID }, error: null },
        'maybeSingle'
      );
      const comment = singleQuery(
        {
          data: {
            created_at: new Date(Date.now() - 16 * 60_000).toISOString(),
            user_id: USER_ID,
          },
          error: null,
        },
        'single'
      );
      const { admin, from } = adminWith(parent, comment);
      mocks.createAdminClient.mockResolvedValue(admin);

      const response = (await handler(request(method) as never, params()))!;

      expect(response.status).toBe(403);
      expect(from).toHaveBeenCalledTimes(2);
    }
  );

  it('updates a self-owned comment in the normalized route workspace', async () => {
    const parent = singleQuery(
      { data: { id: REQUEST_ID }, error: null },
      'maybeSingle'
    );
    const comment = singleQuery(
      { data: recentComment(), error: null },
      'single'
    );
    const updated = updateQuery({ data: { id: COMMENT_ID }, error: null });
    const fetched = singleQuery(
      { data: { id: COMMENT_ID, content: 'Updated' }, error: null },
      'single'
    );
    const { admin } = adminWith(parent, comment, updated, fetched);
    mocks.createAdminClient.mockResolvedValue(admin);

    const response = await PATCH(request('PATCH') as never, params());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: COMMENT_ID,
      content: 'Updated',
    });
    expect(updated.update).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Updated' })
    );
    expect(updated.eq).toHaveBeenCalledWith('id', COMMENT_ID);
    expect(updated.eq).toHaveBeenCalledWith('request_id', REQUEST_ID);
  });

  it('deletes a self-owned comment in the normalized route workspace', async () => {
    const parent = singleQuery(
      { data: { id: REQUEST_ID }, error: null },
      'maybeSingle'
    );
    const comment = singleQuery(
      { data: recentComment(), error: null },
      'single'
    );
    const removed = deleteQuery({ error: null });
    const { admin } = adminWith(parent, comment, removed);
    mocks.createAdminClient.mockResolvedValue(admin);

    const response = await DELETE(request('DELETE') as never, params());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(removed.delete).toHaveBeenCalledOnce();
    expect(removed.eq).toHaveBeenCalledWith('id', COMMENT_ID);
    expect(removed.eq).toHaveBeenCalledWith('request_id', REQUEST_ID);
  });
});
