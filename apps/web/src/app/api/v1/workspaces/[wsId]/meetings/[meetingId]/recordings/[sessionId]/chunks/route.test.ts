import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  identity: vi.fn(),
  membership: vi.fn(),
  normalize: vi.fn(),
  admin: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
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

import { POST as uploadPost } from '../upload/route';
import { POST as chunkPost } from './route';

function query(data: unknown, error: { code: string } | null = null) {
  const result = { data, error };
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    insert: vi.fn(),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.insert.mockReturnValue(q);
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
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.admin.mockResolvedValue({
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
  });
});
describe.each([
  { label: 'chunk upload', handler: chunkPost },
  { label: 'complete upload', handler: uploadPost },
])('$label', ({ handler }) => {
  function request() {
    const req = new NextRequest('https://example.test/api/upload', {
      method: 'POST',
    });
    const form = new FormData();
    form.set(
      'audio',
      new File(['synthetic audio'], 'clip.webm', { type: 'audio/webm' })
    );
    form.set('chunkOrder', '1');
    const parse = vi.spyOn(req, 'formData').mockResolvedValue(form);
    return { req, parse };
  }
  function arrange(
    creatorId = 'actor',
    data: unknown = { id: 'chunk' },
    error: { code: string } | null = null
  ) {
    const chunk = query(data, error);
    mocks.from
      .mockReturnValueOnce(query({ id: 'meeting' }))
      .mockReturnValueOnce(query({ id: 'session', user_id: creatorId }))
      .mockReturnValueOnce(chunk);
    return chunk;
  }
  it('allows the recording creator to store audio and metadata', async () => {
    const chunk = arrange();
    const { req } = request();
    const response = await handler(req, context);
    expect(response.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(chunk.insert).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: 'session' })
    );
  });
  it('allows a workspace admin', async () => {
    arrange('other');
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    const { req } = request();
    expect((await handler(req, context)).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('has_workspace_permission', {
      p_ws_id: 'workspace',
      p_user_id: 'actor',
      p_permission: 'admin',
    });
  });
  it('denies another member before parsing or storing audio', async () => {
    const chunk = arrange('other');
    const { req, parse } = request();
    const response = await handler(req, context);
    expect(response.status).toBe(403);
    expect(parse).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(chunk.insert).not.toHaveBeenCalled();
  });
  it('denies a mismatched parent workspace before storage', async () => {
    mocks.from.mockReturnValueOnce(query(null));
    const { req, parse } = request();
    expect((await handler(req, context)).status).toBe(404);
    expect(parse).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it('cleans up its object and returns 403 when RLS denies metadata', async () => {
    arrange('actor', null, { code: '42501' });
    const { req } = request();
    const response = await handler(req, context);
    expect(response.status).toBe(403);
    expect(mocks.remove).toHaveBeenCalledOnce();
    expect(await response.json()).not.toHaveProperty('success');
  });
  it('does not report success for an empty metadata result', async () => {
    arrange('actor', null);
    const { req } = request();
    const response = await handler(req, context);
    expect(response.status).toBe(403);
    expect(mocks.remove).toHaveBeenCalledOnce();
  });
});
