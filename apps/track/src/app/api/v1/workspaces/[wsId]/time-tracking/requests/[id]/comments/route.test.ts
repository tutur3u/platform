import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  membership: vi.fn(),
  resolveAuth: vi.fn(),
  resolveCoMemberNames: vi.fn(),
  resolveWorkspaceId: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/constants', () => ({
  MAX_LONG_TEXT_LENGTH: 10_000,
  resolveWorkspaceId: mocks.resolveWorkspaceId,
}));
vi.mock('@tuturuuu/utils/co-member-names', () => ({
  resolveCoMemberNames: mocks.resolveCoMemberNames,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.membership,
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: mocks.resolveAuth,
}));

import { GET } from './route';

const WS_ID = '00000000-0000-4000-8000-000000002131';
const REQUEST_ID = '00000000-0000-4000-8000-000000002132';
const VIEWER_ID = '00000000-0000-4000-8000-000000002134';
const AUTHOR_ID = '00000000-0000-4000-8000-000000002135';

function params() {
  return { params: Promise.resolve({ wsId: WS_ID, id: REQUEST_ID }) };
}

function request() {
  return new Request(`https://track.test/requests/${REQUEST_ID}/comments`);
}

function parentQuery() {
  const query: any = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => ({ data: { id: REQUEST_ID }, error: null })),
  };
  return query;
}

function commentsQuery(comments: unknown[]) {
  const query: any = {
    eq: vi.fn(() => query),
    order: vi.fn(async () => ({ data: comments, error: null })),
    select: vi.fn(() => query),
  };
  return query;
}

function adminWith(comments: unknown[]) {
  const from = vi.fn();
  from.mockReturnValueOnce(parentQuery());
  from.mockReturnValueOnce(commentsQuery(comments));
  const admin = { schema: vi.fn(() => ({ from })) };
  mocks.createAdminClient.mockResolvedValue(admin);
  return admin;
}

function comment(displayName: string | null) {
  return {
    content: 'Looks good',
    id: 'comment-1',
    request_id: REQUEST_ID,
    user: { avatar_url: null, display_name: displayName, id: AUTHOR_ID },
    user_id: AUTHOR_ID,
  };
}

describe('Track request comments co-member names', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveWorkspaceId.mockReturnValue(WS_ID);
    mocks.resolveAuth.mockResolvedValue({
      ok: true,
      supabase: { name: 'request-scoped-client' },
      user: { id: VIEWER_ID },
    });
    mocks.membership.mockResolvedValue({ ok: true });
  });

  it('names a nameless co-member author by email for a member viewer', async () => {
    const admin = adminWith([comment(null)]);
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([[AUTHOR_ID, 'author@example.com']])
    );

    const response = await GET(request() as never, params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.comments[0].user.display_name).toBe('author@example.com');
    expect(body.comments[0].user).not.toHaveProperty('email');
    expect(mocks.resolveCoMemberNames).toHaveBeenCalledWith(
      expect.objectContaining({
        admin,
        viewerUserId: VIEWER_ID,
        wsId: WS_ID,
      })
    );
  });

  it('returns no email when the helper withholds it (HIDE_MEMBER_EMAIL or guest viewer)', async () => {
    adminWith([comment(null)]);
    mocks.resolveCoMemberNames.mockResolvedValue(new Map([[AUTHOR_ID, '']]));

    const response = await GET(request() as never, params());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.comments[0].user.display_name).toBeNull();
    expect(JSON.stringify(body)).not.toContain('@example.com');
  });

  it('skips the lookup when every author has a display name', async () => {
    adminWith([comment('Named Author')]);

    const response = await GET(request() as never, params());
    const body = await response.json();

    expect(body.comments[0].user.display_name).toBe('Named Author');
    expect(mocks.resolveCoMemberNames).not.toHaveBeenCalled();
  });

  it('rejects a non-member viewer before any name lookup', async () => {
    mocks.membership.mockResolvedValue({ ok: false });
    adminWith([comment(null)]);

    const response = await GET(request() as never, params());

    expect(response.status).toBe(403);
    expect(mocks.resolveCoMemberNames).not.toHaveBeenCalled();
  });
});
