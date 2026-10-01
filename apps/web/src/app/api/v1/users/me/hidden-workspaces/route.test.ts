import { beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  actor: '00000000-0000-4000-8000-000000000001',
  from: vi.fn(),
  membership: vi.fn(),
}));
vi.mock('next/server', async (load) => ({
  ...(await load<object>()),
  connection: async () => {},
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (handler: (request: Request, auth: unknown) => Promise<Response>) =>
    (req: Request) =>
      handler(req, { user: { id: f.actor }, supabase: { from: f.from } }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: f.membership,
}));

import { GET, PUT } from './route';

const ws = '00000000-0000-4000-8000-000000000010';
const request = (body: object) =>
  new Request('https://test/hidden', {
    method: 'PUT',
    body: JSON.stringify({ expectedActorId: f.actor, ...body }),
  });

describe('owner-only Hidden preferences', () => {
  let query: Record<string, ReturnType<typeof vi.fn>>;
  beforeEach(() => {
    vi.clearAllMocks();
    f.actor = '00000000-0000-4000-8000-000000000001';
    query = { select: vi.fn(), eq: vi.fn(), upsert: vi.fn(), delete: vi.fn() };
    let operation = 'read';
    query.select.mockReturnValue(query);
    query.delete.mockImplementation(() => {
      operation = 'delete';
      return query;
    });
    query.upsert.mockResolvedValue({ error: null });
    query.eq.mockImplementation((key: string) => {
      if (
        (operation === 'read' && key === 'value') ||
        (operation === 'delete' && key === 'id')
      ) {
        return Promise.resolve({ data: [{ ws_id: ws }], error: null });
      }
      return query;
    });
    f.from.mockReturnValue(query);
    f.membership.mockResolvedValue({ ok: true });
  });
  it('projects only owner hidden IDs and forbids shared caching', async () => {
    const response = await GET(
      new Request(`https://test/hidden?expectedActorId=${f.actor}`) as never
    );
    expect(query.select).toHaveBeenCalledWith('ws_id');
    expect(query.eq).toHaveBeenCalledWith('user_id', f.actor);
    expect(query.eq).toHaveBeenCalledWith('id', 'HIDDEN_WORKSPACE');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ hiddenWorkspaceIds: [ws] });
  });
  it.each([
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-000000000003',
  ])('binds %s writes to that actor, never actor A', async (actor) => {
    f.actor = actor;
    const response = await PUT(
      request({ workspaceId: ws, hidden: true }) as never
    );
    expect(response.status).toBe(200);
    expect(f.membership).toHaveBeenCalledWith(
      expect.objectContaining({ userId: actor, wsId: ws })
    );
    expect(query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: actor,
        ws_id: ws,
        id: 'HIDDEN_WORKSPACE',
        value: 'true',
      }),
      { onConflict: 'user_id,ws_id,id' }
    );
    expect(f.from).toHaveBeenCalledTimes(1);
    expect(f.from).toHaveBeenCalledWith('user_workspace_configs');
  });
  it('rejects spoofed owner even for workspace admin', async () => {
    f.actor = '00000000-0000-4000-8000-000000000003';
    const response = await PUT(
      request({ workspaceId: ws, hidden: true, user_id: 'actor-A' }) as never
    );
    expect(response.status).toBe(400);
    expect(f.from).not.toHaveBeenCalled();
  });
  it('restores only actor-owned preference', async () => {
    const response = await PUT(
      request({ workspaceId: ws, hidden: false }) as never
    );
    expect(response.status).toBe(200);
    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('user_id', f.actor);
    expect(query.eq).toHaveBeenCalledWith('ws_id', ws);
    expect(query.eq).toHaveBeenCalledWith('id', 'HIDDEN_WORKSPACE');
  });
  it.each([
    ['membership_lookup_failed', 500],
    ['not_member', 403],
  ])('denies %s before preference writes', async (error, status) => {
    f.membership.mockResolvedValue({ ok: false, error });
    const response = await PUT(
      request({ workspaceId: ws, hidden: true }) as never
    );
    expect(response.status).toBe(status);
    expect(f.from).not.toHaveBeenCalled();
  });
  it('rejects delayed mutation after account switch before any write', async () => {
    const previousActor = f.actor;
    f.actor = '00000000-0000-4000-8000-000000000002';
    const response = await PUT(
      request({
        workspaceId: ws,
        hidden: true,
        expectedActorId: previousActor,
      }) as never
    );
    expect(response.status).toBe(409);
    expect(f.from).not.toHaveBeenCalled();
  });
  it('rejects list fetch bound to a different account', async () => {
    const response = await GET(
      new Request('https://test/hidden?expectedActorId=other') as never
    );
    expect(response.status).toBe(409);
    expect(f.from).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    'guest can update own private preference hidden=%s',
    async (hidden) => {
      f.membership.mockImplementation(async ({ requiredType }) =>
        requiredType === 'ANY'
          ? { ok: true, membershipType: 'GUEST' }
          : { ok: false, error: 'membership_type_mismatch' }
      );
      const response = await PUT(request({ workspaceId: ws, hidden }) as never);
      expect(response.status).toBe(200);
      expect(f.membership).toHaveBeenCalledWith(
        expect.objectContaining({ userId: f.actor, requiredType: 'ANY' })
      );
    }
  );
});
