import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeJournal } from './auth';

const mock = vi.hoisted(() => ({
  client: vi.fn(),
  admin: vi.fn(),
  claims: vi.fn(),
  user: vi.fn(),
  from: vi.fn(),
  workspace: vi.fn(),
  member: vi.fn(),
  alias: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mock.client,
  createAdminClient: mock.admin,
}));
const actorId = '00000000-0000-4000-8000-000000000001',
  workspaceId = '00000000-0000-4000-8000-000000000002';
const request = new NextRequest('https://example.test/api/journal');
beforeEach(() => {
  vi.clearAllMocks();
  mock.admin.mockImplementation(() => {
    throw new Error('Privileged client before admission');
  });
  mock.claims.mockResolvedValue({
    data: { claims: { sub: actorId } },
    error: null,
  });
  mock.user.mockResolvedValue({ data: { user: { id: actorId } }, error: null });
  mock.client.mockResolvedValue({
    auth: { getClaims: mock.claims, getUser: mock.user },
    from: mock.from,
  });
  mock.from.mockImplementation((table: string) => {
    let selection = '';
    const query = {
      select: vi.fn((value: string) => {
        selection = value;
        return query;
      }),
      eq: vi.fn(() => query),
      maybeSingle: () =>
        table === 'workspace_members'
          ? mock.member()
          : selection.includes('!inner')
            ? mock.alias()
            : mock.workspace(),
    };
    return query;
  });
  mock.member.mockResolvedValue({ data: { type: 'MEMBER' }, error: null });
  mock.alias.mockResolvedValue({ data: { id: workspaceId }, error: null });
  mock.workspace.mockResolvedValue({
    data: {
      id: workspaceId,
      personal: true,
      creator_id: actorId,
      deleted: false,
    },
    error: null,
  });
});
describe('real fresh-user and personal-alias admission', () => {
  it('uses real session resolver and workspace helpers without privileged fallback', async () => {
    expect(await authorizeJournal(request, 'personal')).toEqual({
      ok: true,
      scope: { actorId, workspaceId },
    });
    expect(mock.client).toHaveBeenCalledWith(request);
    expect(mock.user).toHaveBeenCalledTimes(1);
    expect(mock.alias).toHaveBeenCalledTimes(1);
    expect(mock.member).toHaveBeenCalledTimes(1);
    expect(mock.admin).not.toHaveBeenCalled();
  });
  it('denies a revoked actor even when claims remain valid, including app-session requests', async () => {
    mock.user.mockResolvedValue({
      data: { user: null },
      error: new Error('Revoked actor'),
    });
    const appRequest = new NextRequest('https://example.test/api/journal', {
      headers: { cookie: 'tuturuuu_app_session=synthetic-still-valid-token' },
    });
    for (const current of [request, appRequest]) {
      const result = await authorizeJournal(current, 'personal');
      if (result.ok) throw new Error('Unexpected access');
      expect(result.response.status).toBe(401);
    }
    expect(mock.user).toHaveBeenCalledTimes(2);
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.admin).not.toHaveBeenCalled();
  });
  it('rejects handles before the real normalizer can use its admin fallback', async () => {
    const result = await authorizeJournal(request, 'a-team-handle');
    if (result.ok) throw new Error('Unexpected access');
    expect(result.response.status).toBe(403);
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.admin).not.toHaveBeenCalled();
  });
  it('denies team, deleted, foreign creator and absent workspaces', async () => {
    for (const data of [
      null,
      { personal: false, creator_id: actorId },
      { personal: true, creator_id: workspaceId },
      { personal: true, creator_id: actorId, deleted: true },
    ]) {
      mock.workspace.mockResolvedValue({ data, error: null });
      const result = await authorizeJournal(request, workspaceId);
      if (result.ok) throw new Error('Unexpected access');
      expect(result.response.status).toBe(403);
      expect(result.response.headers.get('Cache-Control')).toBe(
        'private, no-store'
      );
    }
    expect(mock.admin).not.toHaveBeenCalled();
  });
  it('distinguishes membership outage from denial and stops before owner lookup', async () => {
    mock.member.mockResolvedValue({
      data: null,
      error: { message: 'Unavailable' },
    });
    const result = await authorizeJournal(request, workspaceId);
    if (result.ok) throw new Error('Unexpected access');
    expect(result.response.status).toBe(500);
    expect(mock.workspace).not.toHaveBeenCalled();
    expect(mock.admin).not.toHaveBeenCalled();
  });
});
