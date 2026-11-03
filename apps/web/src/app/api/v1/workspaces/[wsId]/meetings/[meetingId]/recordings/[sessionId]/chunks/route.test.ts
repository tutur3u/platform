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
])('$label is locked (legacy recorder retired)', ({ handler }) => {
  function request(locale?: string) {
    const req = new NextRequest('https://example.test/api/upload', {
      method: 'POST',
      headers: locale ? { 'accept-language': locale } : undefined,
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
  function arrange(creatorId = 'actor') {
    const chunk = query({ id: 'chunk' });
    mocks.from
      .mockReturnValueOnce(query({ id: 'meeting' }))
      .mockReturnValueOnce(query({ id: 'session', user_id: creatorId }))
      .mockReturnValueOnce(chunk);
    return chunk;
  }
  function expectNothingStored(
    chunk: ReturnType<typeof query>,
    parse: ReturnType<typeof vi.spyOn>
  ) {
    expect(parse).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(chunk.insert).not.toHaveBeenCalled();
  }
  it.each([
    ['the recording creator', 'actor', false],
    ['a workspace admin', 'other', true],
  ])(
    'refuses %s before parsing or storing audio',
    async (_, creatorId, isAdmin) => {
      const chunk = arrange(creatorId);
      mocks.rpc.mockResolvedValue({ data: isAdmin, error: null });
      const { req, parse } = request();
      const response = await handler(req, context);
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body).toMatchObject({ code: 'LEGACY_MEETING_RECORDER_RETIRED' });
      expect(body).not.toHaveProperty('success');
      expect(body.error).toContain('Meet');
      expectNothingStored(chunk, parse);
    }
  );
  it.each([
    ['en', 'old meeting recorder'],
    ['vi', 'Trình ghi âm cuộc họp cũ'],
  ])('localizes the refusal for %s', async (locale, expected) => {
    arrange();
    const { req } = request(locale);
    const response = await handler(req, context);
    expect((await response.json()).error).toContain(expected);
  });
  it('still requires authentication', async () => {
    const chunk = arrange();
    mocks.identity.mockResolvedValue({ user: null, authError: null });
    const { req, parse } = request();
    expect((await handler(req, context)).status).toBe(401);
    expectNothingStored(chunk, parse);
  });
});
