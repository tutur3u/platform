import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  identity: vi.fn(),
  membership: vi.fn(),
  normalize: vi.fn(),
  admin: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }),
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.identity,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalize,
  verifyWorkspaceMembershipType: mocks.membership,
}));

import { DELETE, PATCH, PUT } from './route';

function query(data: unknown) {
  const result = { data, error: null };
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    update: vi.fn(),
    delete: vi.fn(),
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally thenable.
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.update.mockReturnValue(q);
  q.delete.mockReturnValue(q);
  return q;
}
const context = {
  params: Promise.resolve({
    wsId: 'workspace',
    meetingId: 'meeting',
    sessionId: 'session',
  }),
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.normalize.mockResolvedValue('workspace');
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.identity.mockResolvedValue({ user: { id: 'actor' }, authError: null });
  mocks.rpc.mockResolvedValue({ data: false, error: null });
});
describe.each([
  { method: 'PUT', handler: PUT },
  { method: 'PATCH', handler: PATCH },
  { method: 'DELETE', handler: DELETE },
])('$method recording session', ({ method, handler }) => {
  function request() {
    return new NextRequest('https://example.test/api/session', {
      method,
      body: JSON.stringify({ status: 'completed' }),
    });
  }
  function arrange(creatorId: string, rows = [{ id: 'session' }]) {
    const change = query(rows);
    mocks.from
      .mockReturnValueOnce(query({ id: 'meeting' }))
      .mockReturnValueOnce(query({ id: 'session', user_id: creatorId }))
      .mockReturnValueOnce(change);
    return change;
  }
  it('allows creator writes with returned rows', async () => {
    const change = arrange('actor');
    const response = await handler(request(), context);
    expect(response.status).toBe(200);
    expect(change.select).toHaveBeenCalledWith('id');
  });
  it('allows workspace admin writes', async () => {
    arrange('other');
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect((await handler(request(), context)).status).toBe(200);
  });
  it('denies another member before a mutation or private transcript access', async () => {
    const change = arrange('other');
    const response = await handler(request(), context);
    expect(response.status).toBe(403);
    expect(change.update).not.toHaveBeenCalled();
    expect(change.delete).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('returns 403 on zero affected rows', async () => {
    arrange('actor', []);
    const response = await handler(request(), context);
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty('success');
  });
  it('does not authorize a meeting from another workspace', async () => {
    mocks.from.mockReturnValueOnce(query(null));
    expect((await handler(request(), context)).status).toBe(404);
    expect(mocks.from).toHaveBeenCalledTimes(1);
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
