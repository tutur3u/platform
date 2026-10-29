import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  identity: vi.fn(),
  membership: vi.fn(),
  normalize: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.identity,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalize,
  verifyWorkspaceMembershipType: mocks.membership,
}));

import { POST } from './route';

function query(data: unknown, error: { code: string } | null = null) {
  const result = { data, error };
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
    update: vi.fn(),
    insert: vi.fn(),
    // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally thenable.
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.update.mockReturnValue(q);
  q.insert.mockReturnValue(q);
  return q;
}
function request() {
  return new NextRequest('https://example.test/api/record', { method: 'POST' });
}
const context = {
  params: Promise.resolve({ wsId: 'workspace', meetingId: 'meeting' }),
};
function arrange(
  creatorId = 'actor',
  changed: unknown = [{ id: 'session' }],
  error: { code: string } | null = null
) {
  const meeting = query({ id: 'meeting' });
  const session = query({ id: 'session', user_id: creatorId });
  const update = query(changed, error);
  mocks.from
    .mockReturnValueOnce(meeting)
    .mockReturnValueOnce(session)
    .mockReturnValueOnce(update);
  return { session, update };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.normalize.mockResolvedValue('workspace');
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.identity.mockResolvedValue({ user: { id: 'actor' }, authError: null });
  mocks.rpc.mockResolvedValue({ data: false, error: null });
});
describe('legacy recording stop authorization', () => {
  it('allows the recording creator and returns the changed session', async () => {
    const { update } = arrange();
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      action: 'stopped',
      sessionId: 'session',
    });
    expect(update.select).toHaveBeenCalledWith('id');
    expect(update.eq).toHaveBeenCalledWith('meeting_id', 'meeting');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('allows a workspace admin', async () => {
    arrange('someone-else');
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ action: 'stopped' });
    expect(mocks.rpc).toHaveBeenCalledWith('has_workspace_permission', {
      p_ws_id: 'workspace',
      p_user_id: 'actor',
      p_permission: 'admin',
    });
  });
  it('denies another member before any mutation', async () => {
    const { update } = arrange('someone-else');
    const response = await POST(request(), context);
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty('action');
    expect(update.update).not.toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });
  it('returns 403 when RLS or a concurrent deletion leaves zero changed rows', async () => {
    arrange('actor', []);
    const response = await POST(request(), context);
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty('action');
  });
  it('returns a safe 403 for a database permission denial', async () => {
    arrange('actor', null, { code: '42501' });
    const response = await POST(request(), context);
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty('action');
  });
  it('fails closed if the admin permission lookup fails', async () => {
    const { update } = arrange('someone-else');
    mocks.rpc.mockResolvedValue({
      data: true,
      error: { message: 'unavailable' },
    });
    const response = await POST(request(), context);
    expect(response.status).toBe(500);
    expect(update.update).not.toHaveBeenCalled();
  });
});
