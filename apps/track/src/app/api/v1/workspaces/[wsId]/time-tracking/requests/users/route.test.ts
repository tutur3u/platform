import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const WS_ID = '00000000-0000-4000-8000-0000000000a1';
const VIEWER_ID = '00000000-0000-4000-8000-0000000000d1';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveCoMemberNames: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: (
    ...args: Parameters<typeof mocks.resolveSessionAuthContext>
  ) => mocks.resolveSessionAuthContext(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
  ) => mocks.verifyWorkspaceMembershipType(...args),
}));

vi.mock('@tuturuuu/utils/co-member-names', () => ({
  resolveCoMemberNames: (
    ...args: Parameters<typeof mocks.resolveCoMemberNames>
  ) => mocks.resolveCoMemberNames(...args),
}));

const requestRows = [
  {
    user_id: 'user-named',
    user: {
      id: 'user-named',
      display_name: 'Named Requester',
      user_private_details: [{ email: 'named@example.com' }],
    },
  },
  {
    user_id: 'user-nameless',
    user: {
      id: 'user-nameless',
      display_name: null,
      user_private_details: [{ email: 'nameless@example.com' }],
    },
  },
  {
    user_id: 'user-nameless',
    user: {
      id: 'user-nameless',
      display_name: null,
      user_private_details: [{ email: 'nameless@example.com' }],
    },
  },
];

function createAdminClient() {
  const viewQuery = {
    eq: vi.fn(async () => ({ data: requestRows, error: null })),
    select: vi.fn(() => viewQuery),
  };
  const usersQuery = {
    in: vi.fn(async () => ({
      data: [
        { id: 'user-named', display_name: 'Named Requester', handle: 'named' },
        { id: 'user-nameless', display_name: null, handle: 'nameless' },
      ],
      error: null,
    })),
    select: vi.fn(() => usersQuery),
  };
  return {
    from: vi.fn((table: string) => {
      expect(table).toBe('users');
      return usersQuery;
    }),
    schema: vi.fn(() => ({ from: vi.fn(() => viewQuery) })),
    usersQuery,
  };
}

async function callRoute() {
  const { GET } = await import('./route');
  return GET(
    new NextRequest(
      `http://localhost/api/v1/workspaces/${WS_ID}/time-tracking/requests/users`
    ),
    { params: Promise.resolve({ wsId: WS_ID }) }
  );
}

describe('time tracking request users route (D246 names)', () => {
  let admin: ReturnType<typeof createAdminClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    admin = createAdminClient();
    mocks.createAdminClient.mockResolvedValue(admin);
    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: {},
      user: { id: VIEWER_ID },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(WS_ID);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.getPermissions.mockResolvedValue({ withoutPermission: () => false });
  });

  it('returns the co-member email as the name of a nameless member', async () => {
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([
        ['user-named', 'Named Requester'],
        ['user-nameless', 'nameless@example.com'],
      ])
    );

    const response = await callRoute();

    expect(response.status).toBe(200);
    expect(mocks.resolveCoMemberNames).toHaveBeenCalledWith({
      admin,
      wsId: WS_ID,
      viewerUserId: VIEWER_ID,
      users: [
        { id: 'user-named', display_name: 'Named Requester', handle: 'named' },
        { id: 'user-nameless', display_name: null, handle: 'nameless' },
      ],
      options: { fallback: 'Unknown' },
    });
    expect(admin.usersQuery.in).toHaveBeenCalledWith('id', [
      'user-named',
      'user-nameless',
    ]);
    const body = await response.json();
    expect(body).toEqual([
      { id: 'user-named', display_name: 'Named Requester' },
      { id: 'user-nameless', display_name: 'nameless@example.com' },
    ]);
    expect(body[0]).not.toHaveProperty('email');
  });

  it('never forwards the view email when the resolver withholds it (HIDE_MEMBER_EMAIL or guest viewer)', async () => {
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([
        ['user-named', 'Named Requester'],
        ['user-nameless', 'nameless'],
      ])
    );

    const response = await callRoute();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toContain('@example.com');
    expect(JSON.parse(text)).toEqual([
      { id: 'user-named', display_name: 'Named Requester' },
      { id: 'user-nameless', display_name: 'nameless' },
    ]);
  });

  it('does not resolve names for viewers without request management', async () => {
    mocks.getPermissions.mockResolvedValue({ withoutPermission: () => true });

    const response = await callRoute();

    expect(response.status).toBe(403);
    expect(mocks.resolveCoMemberNames).not.toHaveBeenCalled();
  });
});
