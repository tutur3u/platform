import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const getPermissionsMock = vi.fn();
const normalizeWorkspaceIdMock = vi.fn();
const serverLoggerErrorMock = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof normalizeWorkspaceIdMock>
  ) => normalizeWorkspaceIdMock(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof serverLoggerErrorMock>) =>
      serverLoggerErrorMock(...args),
  },
}));

import { POST } from './route';

const WS_ID = '00000000-0000-4000-8000-000000000001';
const VIRTUAL_USER_ID = '00000000-0000-4000-8000-000000000101';
const OTHER_VIRTUAL_USER_ID = '00000000-0000-4000-8000-000000000102';
const PLATFORM_USER_ID = '00000000-0000-4000-8000-000000000201';
const OTHER_PLATFORM_USER_ID = '00000000-0000-4000-8000-000000000202';
const REPAIR_PERMISSIONS = [
  'update_users',
  'view_users_private_info',
  'view_users_public_info',
] as const;

interface WorkspaceUserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  full_name: string | null;
  ws_id: string;
}

interface LinkRow {
  platform_user_id: string;
  virtual_user_id: string;
  ws_id: string;
}

interface MemberRow {
  user_id: string;
  ws_id?: string;
}

interface PrivateDetailsRow {
  user_id: string;
  email: string | null;
}

function filterRows<T extends object>(
  rows: T[],
  filters: Record<string, unknown>
) {
  return rows.filter((row) =>
    Object.entries(filters).every(
      ([key, value]) => (row as Record<string, unknown>)[key] === value
    )
  );
}

function createSelectQuery<T extends object>(rows: T[]) {
  const filters: Record<string, unknown> = {};
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => {
      filters[key] = value;
      return query;
    }),
    order: vi.fn(async () => ({
      data: filterRows(rows, filters),
      error: null,
    })),
  };

  return query;
}

function createPrivateDetailsQuery(rows: PrivateDetailsRow[]) {
  return {
    select: vi.fn(() => ({
      in: vi.fn(async (_key: string, values: string[]) => ({
        data: rows.filter((row) => values.includes(row.user_id)),
        error: null,
      })),
    })),
  };
}

function createAdminClient({
  links = [],
  members = [],
  privateDetails = [],
  workspaceUsers = [],
}: {
  links?: LinkRow[];
  members?: MemberRow[];
  privateDetails?: PrivateDetailsRow[];
  workspaceUsers?: WorkspaceUserRow[];
}) {
  const insertedLinks: LinkRow[] = [];
  const from = vi.fn((table: string) => {
    if (table === 'workspace_users') {
      return createSelectQuery(workspaceUsers);
    }

    if (table === 'workspace_members') {
      return createSelectQuery(members);
    }

    if (table === 'user_private_details') {
      return createPrivateDetailsQuery(privateDetails);
    }

    if (table === 'workspace_user_linked_users') {
      const selectQuery = createSelectQuery(links);
      return {
        ...selectQuery,
        insert: vi.fn(async (rows: LinkRow[]) => {
          insertedLinks.push(...rows);
          return { error: null };
        }),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });

  return {
    client: { from },
    insertedLinks,
  };
}

function createRequest(body?: unknown) {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/${WS_ID}/users/links/repair`,
    {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }
  );
}

async function callPost(body?: unknown) {
  const request = createRequest(body);
  return POST(request, {
    params: Promise.resolve({ wsId: WS_ID }),
  });
}

const skipScenarios: Array<{
  expectedReason: string;
  links?: LinkRow[];
  members?: MemberRow[];
  name: string;
  privateDetails?: PrivateDetailsRow[];
  workspaceUsers: WorkspaceUserRow[];
}> = [
  {
    name: 'missing_email',
    workspaceUsers: [
      {
        id: VIRTUAL_USER_ID,
        email: null,
        display_name: 'Missing Email',
        full_name: null,
        ws_id: WS_ID,
      },
    ],
    expectedReason: 'missing_email',
  },
  {
    name: 'no_member_match',
    workspaceUsers: [
      {
        id: VIRTUAL_USER_ID,
        email: 'missing@example.com',
        display_name: 'No Member',
        full_name: null,
        ws_id: WS_ID,
      },
    ],
    members: [{ user_id: PLATFORM_USER_ID, ws_id: WS_ID }],
    privateDetails: [{ user_id: PLATFORM_USER_ID, email: 'other@example.com' }],
    expectedReason: 'no_member_match',
  },
  {
    name: 'ambiguous_workspace_profile',
    workspaceUsers: [
      {
        id: VIRTUAL_USER_ID,
        email: 'same@example.com',
        display_name: 'First',
        full_name: null,
        ws_id: WS_ID,
      },
      {
        id: OTHER_VIRTUAL_USER_ID,
        email: 'same@example.com',
        display_name: 'Second',
        full_name: null,
        ws_id: WS_ID,
      },
    ],
    members: [{ user_id: PLATFORM_USER_ID, ws_id: WS_ID }],
    privateDetails: [{ user_id: PLATFORM_USER_ID, email: 'same@example.com' }],
    expectedReason: 'ambiguous_workspace_profile',
  },
  {
    name: 'ambiguous_platform_match',
    workspaceUsers: [
      {
        id: VIRTUAL_USER_ID,
        email: 'shared@example.com',
        display_name: 'Shared',
        full_name: null,
        ws_id: WS_ID,
      },
    ],
    members: [
      { user_id: PLATFORM_USER_ID, ws_id: WS_ID },
      { user_id: OTHER_PLATFORM_USER_ID, ws_id: WS_ID },
    ],
    privateDetails: [
      { user_id: PLATFORM_USER_ID, email: 'shared@example.com' },
      { user_id: OTHER_PLATFORM_USER_ID, email: ' shared@example.com ' },
    ],
    expectedReason: 'ambiguous_platform_match',
  },
  {
    name: 'already_linked',
    workspaceUsers: [
      {
        id: VIRTUAL_USER_ID,
        email: 'linked@example.com',
        display_name: 'Linked',
        full_name: null,
        ws_id: WS_ID,
      },
    ],
    links: [
      {
        platform_user_id: PLATFORM_USER_ID,
        virtual_user_id: VIRTUAL_USER_ID,
        ws_id: WS_ID,
      },
    ],
    expectedReason: 'already_linked',
  },
  {
    name: 'platform_already_linked',
    workspaceUsers: [
      {
        id: VIRTUAL_USER_ID,
        email: 'platform@example.com',
        display_name: 'Candidate',
        full_name: null,
        ws_id: WS_ID,
      },
      {
        id: OTHER_VIRTUAL_USER_ID,
        email: 'other@example.com',
        display_name: 'Already Linked',
        full_name: null,
        ws_id: WS_ID,
      },
    ],
    links: [
      {
        platform_user_id: PLATFORM_USER_ID,
        virtual_user_id: OTHER_VIRTUAL_USER_ID,
        ws_id: WS_ID,
      },
    ],
    members: [{ user_id: PLATFORM_USER_ID, ws_id: WS_ID }],
    privateDetails: [
      { user_id: PLATFORM_USER_ID, email: 'platform@example.com' },
    ],
    expectedReason: 'platform_already_linked',
  },
];

describe('workspace user platform link repair route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    normalizeWorkspaceIdMock.mockImplementation(async (wsId: string) => wsId);
    getPermissionsMock.mockResolvedValue({
      containsPermission: (permission: string) =>
        REPAIR_PERMISSIONS.includes(
          permission as (typeof REPAIR_PERMISSIONS)[number]
        ),
    });
  });

  it('rejects callers without update and private-info permissions', async () => {
    getPermissionsMock.mockResolvedValue({
      containsPermission: () => false,
    });

    const response = await callPost();

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('rejects callers without public-info permission before loading user names', async () => {
    getPermissionsMock.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'update_users' ||
        permission === 'view_users_private_info',
    });

    const response = await callPost();

    expect(response.status).toBe(403);
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it('repairs a single virtual profile using normalized email matching', async () => {
    const admin = createAdminClient({
      workspaceUsers: [
        {
          id: VIRTUAL_USER_ID,
          email: '  Student@Example.COM ',
          display_name: 'Student',
          full_name: 'Student One',
          ws_id: WS_ID,
        },
      ],
      members: [{ user_id: PLATFORM_USER_ID, ws_id: WS_ID }],
      privateDetails: [
        {
          user_id: PLATFORM_USER_ID,
          email: 'student@example.com',
        },
      ],
    });
    createAdminClientMock.mockResolvedValue(admin.client);

    const response = await callPost({ workspaceUserId: VIRTUAL_USER_ID });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(admin.insertedLinks).toEqual([
      {
        platform_user_id: PLATFORM_USER_ID,
        virtual_user_id: VIRTUAL_USER_ID,
        ws_id: WS_ID,
      },
    ]);
    expect(json).toMatchObject({
      linked: [
        {
          email: 'student@example.com',
          platformUserId: PLATFORM_USER_ID,
          workspaceUserId: VIRTUAL_USER_ID,
        },
      ],
      summary: {
        linked: 1,
        scanned: 1,
        skipped: 0,
      },
    });
  });

  it('bulk-repairs eligible unlinked profiles without reporting already-linked rows', async () => {
    const admin = createAdminClient({
      workspaceUsers: [
        {
          id: VIRTUAL_USER_ID,
          email: 'linked@example.com',
          display_name: 'Linked',
          full_name: null,
          ws_id: WS_ID,
        },
        {
          id: OTHER_VIRTUAL_USER_ID,
          email: 'existing@example.com',
          display_name: 'Existing',
          full_name: null,
          ws_id: WS_ID,
        },
      ],
      links: [
        {
          platform_user_id: OTHER_PLATFORM_USER_ID,
          virtual_user_id: OTHER_VIRTUAL_USER_ID,
          ws_id: WS_ID,
        },
      ],
      members: [
        { user_id: PLATFORM_USER_ID, ws_id: WS_ID },
        { user_id: OTHER_PLATFORM_USER_ID, ws_id: WS_ID },
      ],
      privateDetails: [
        { user_id: PLATFORM_USER_ID, email: 'linked@example.com' },
        { user_id: OTHER_PLATFORM_USER_ID, email: 'existing@example.com' },
      ],
    });
    createAdminClientMock.mockResolvedValue(admin.client);

    const response = await callPost();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(admin.insertedLinks).toHaveLength(1);
    expect(admin.insertedLinks[0]?.virtual_user_id).toBe(VIRTUAL_USER_ID);
    expect(json.summary).toEqual({
      linked: 1,
      scanned: 1,
      skipped: 0,
    });
  });

  it.each(
    skipScenarios
  )('skips single-row repair for $name', async (scenario) => {
    const admin = createAdminClient({
      links: scenario.links,
      members: scenario.members,
      privateDetails: scenario.privateDetails,
      workspaceUsers: scenario.workspaceUsers,
    });
    createAdminClientMock.mockResolvedValue(admin.client);

    const response = await callPost({ workspaceUserId: VIRTUAL_USER_ID });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(admin.insertedLinks).toHaveLength(0);
    expect(json.skipped).toEqual([
      expect.objectContaining({
        reason: scenario.expectedReason,
        workspaceUserId: VIRTUAL_USER_ID,
      }),
    ]);
    expect(json.summary).toMatchObject({
      linked: 0,
      scanned: 1,
      skipped: 1,
    });
  });
});
