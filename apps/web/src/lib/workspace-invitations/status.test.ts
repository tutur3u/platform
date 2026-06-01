import { describe, expect, it, vi } from 'vitest';
import {
  getWorkspaceInviteStatus,
  listPendingWorkspaceInvitations,
} from './status';

const userId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';
const otherWorkspaceId = '33333333-3333-4333-8333-333333333333';

type TestState = {
  directInvites?: Array<{
    created_at: string | null;
    type: 'MEMBER' | 'GUEST';
    user_id: string;
    ws_id: string;
  }>;
  emailInvites?: Array<{
    created_at: string | null;
    email: string;
    type: 'MEMBER' | 'GUEST';
    ws_id: string;
  }>;
  members?: Array<{ user_id: string; ws_id: string }>;
  privateEmail?: string | null;
  workspaces?: Array<{
    avatar_url: string | null;
    handle: string | null;
    id: string;
    logo_url: string | null;
    name: string | null;
    personal: boolean;
  }>;
};

function createQueryResult(data: unknown, error = null) {
  return { data, error };
}

function applyFilters(
  rows: Array<Record<string, unknown>>,
  filters: Record<string, unknown>
) {
  return rows.filter((row) =>
    Object.entries(filters).every(([field, expected]) => {
      const actual = row[field];

      if (Array.isArray(expected)) {
        return expected.includes(actual);
      }

      return actual === expected;
    })
  );
}

function createAdminClientMock(state: TestState = {}) {
  const workspaces = state.workspaces ?? [
    {
      avatar_url: null,
      handle: 'workspace',
      id: workspaceId,
      logo_url: null,
      name: 'Workspace',
      personal: false,
    },
    {
      avatar_url: null,
      handle: 'other',
      id: otherWorkspaceId,
      logo_url: null,
      name: 'Other Workspace',
      personal: false,
    },
  ];

  function resolveTable(
    table: string,
    filters: Record<string, unknown>,
    maybeSingle = false
  ) {
    if (table === 'user_private_details') {
      return createQueryResult(
        state.privateEmail === null
          ? null
          : { email: state.privateEmail ?? 'private@example.com' }
      );
    }

    if (table === 'workspace_members') {
      return createQueryResult(
        applyFilters(state.members ?? [], filters as Record<string, unknown>)
      );
    }

    if (table === 'workspace_invites') {
      return createQueryResult(
        applyFilters(
          state.directInvites ?? [],
          filters as Record<string, unknown>
        )
      );
    }

    if (table === 'workspace_email_invites') {
      return createQueryResult(
        applyFilters(
          state.emailInvites ?? [],
          filters as Record<string, unknown>
        )
      );
    }

    if (table === 'workspaces') {
      const rows = applyFilters(workspaces, filters as Record<string, unknown>);
      return createQueryResult(maybeSingle ? (rows[0] ?? null) : rows);
    }

    return createQueryResult(maybeSingle ? null : []);
  }

  function createBuilder(table: string) {
    const filters: Record<string, unknown> = {};
    const builder = {
      eq: vi.fn((field: string, value: unknown) => {
        filters[field] = value;
        return builder;
      }),
      in: vi.fn((field: string, value: unknown) => {
        filters[field] = value;
        return builder;
      }),
      maybeSingle: vi.fn(() =>
        Promise.resolve(resolveTable(table, filters, true))
      ),
      select: vi.fn(() => builder),
    };

    Object.defineProperty(builder, 'then', {
      value: (
        onFulfilled?: (value: unknown) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) =>
        Promise.resolve(resolveTable(table, filters)).then(
          onFulfilled,
          onRejected
        ),
    });

    return builder;
  }

  return {
    from: vi.fn((table: string) => createBuilder(table)),
  };
}

describe('workspace invitation status helpers', () => {
  it('returns a direct pending invite for a non-member', async () => {
    const admin = createAdminClientMock({
      directInvites: [
        {
          created_at: '2026-06-01T00:00:00.000Z',
          type: 'MEMBER',
          user_id: userId,
          ws_id: workspaceId,
        },
      ],
    });

    const result = await getWorkspaceInviteStatus(admin as never, {
      authEmail: 'user@example.com',
      userId,
      workspaceId,
    });

    expect(result.status).toBe('pending_invite');
    if (result.status === 'pending_invite') {
      expect(result.invitation.source).toBe('direct');
      expect(result.invitation.workspace.id).toBe(workspaceId);
    }
  });

  it('returns an email pending invite for the authenticated email', async () => {
    const admin = createAdminClientMock({
      emailInvites: [
        {
          created_at: '2026-06-01T00:00:00.000Z',
          email: 'user@example.com',
          type: 'GUEST',
          ws_id: workspaceId,
        },
      ],
      privateEmail: null,
    });

    const result = await getWorkspaceInviteStatus(admin as never, {
      authEmail: 'User@Example.com',
      userId,
      workspaceId,
    });

    expect(result.status).toBe('pending_invite');
    if (result.status === 'pending_invite') {
      expect(result.invitation.source).toBe('email');
      expect(result.invitation.type).toBe('GUEST');
    }
  });

  it('matches pending email invites against the private email', async () => {
    const admin = createAdminClientMock({
      emailInvites: [
        {
          created_at: '2026-06-01T00:00:00.000Z',
          email: 'private@example.com',
          type: 'MEMBER',
          ws_id: workspaceId,
        },
      ],
      privateEmail: 'Private@Example.com',
    });

    const result = await getWorkspaceInviteStatus(admin as never, {
      authEmail: null,
      userId,
      workspaceId,
    });

    expect(result.status).toBe('pending_invite');
    if (result.status === 'pending_invite') {
      expect(result.invitation.matchedEmail).toBe('private@example.com');
    }
  });

  it('returns member before pending invite when membership already exists', async () => {
    const admin = createAdminClientMock({
      directInvites: [
        {
          created_at: '2026-06-01T00:00:00.000Z',
          type: 'MEMBER',
          user_id: userId,
          ws_id: workspaceId,
        },
      ],
      members: [{ user_id: userId, ws_id: workspaceId }],
    });

    const result = await getWorkspaceInviteStatus(admin as never, {
      authEmail: 'user@example.com',
      userId,
      workspaceId,
    });

    expect(result.status).toBe('member');
  });

  it('returns none when there is no membership or pending invite', async () => {
    const admin = createAdminClientMock({ privateEmail: null });

    const result = await getWorkspaceInviteStatus(admin as never, {
      authEmail: 'user@example.com',
      userId,
      workspaceId,
    });

    expect(result).toMatchObject({
      status: 'none',
      workspace: { id: workspaceId },
    });
  });

  it('deduplicates direct and email invite rows for the same workspace', async () => {
    const admin = createAdminClientMock({
      directInvites: [
        {
          created_at: '2026-06-01T00:00:00.000Z',
          type: 'MEMBER',
          user_id: userId,
          ws_id: workspaceId,
        },
      ],
      emailInvites: [
        {
          created_at: '2026-06-01T00:00:00.000Z',
          email: 'user@example.com',
          type: 'GUEST',
          ws_id: workspaceId,
        },
      ],
      privateEmail: null,
    });

    const invitations = await listPendingWorkspaceInvitations(admin as never, {
      authEmail: 'user@example.com',
      userId,
    });

    expect(invitations).toHaveLength(1);
    expect(invitations[0]).toMatchObject({
      source: 'direct',
      workspace: { id: workspaceId },
    });
  });
});
