import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

import { POST } from './route';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const BOARD_ID = '00000000-0000-4000-8000-000000000002';
const PROJECT_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_PROJECT_ID = '00000000-0000-4000-8000-000000000004';
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000005';
const OTHER_WORKSPACE_ID = '00000000-0000-4000-8000-000000000006';

let boardResult: { data: { ws_id: string } | null; error: unknown };
let projectResult: { data: Array<{ ws_id: string }> | null; error: unknown };
const boardIdFilter = vi.fn();
const projectIdsFilter = vi.fn();

function request(body: unknown) {
  return new Request(
    'https://tasks.tuturuuu.com/api/v1/task-projects/resolve-workspace',
    {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }
  );
}

async function expectNoWorkspaceDisclosure(
  response: Response,
  status: number,
  workspaceId = WORKSPACE_ID
) {
  const responseText = await response.text();

  expect(response.status).toBe(status);
  expect(responseText).not.toContain(workspaceId);
  expect(JSON.parse(responseText)).not.toHaveProperty('workspaceId');
}

describe('task project workspace resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    boardResult = { data: { ws_id: WORKSPACE_ID }, error: null };
    projectResult = { data: [{ ws_id: WORKSPACE_ID }], error: null };

    boardIdFilter.mockImplementation(() => ({
      maybeSingle: () => Promise.resolve(boardResult),
    }));
    projectIdsFilter.mockImplementation(() => Promise.resolve(projectResult));

    const supabase = {
      from: vi.fn((table: string) => {
        if (table !== 'task_projects') {
          throw new Error(`Unexpected user-client table: ${table}`);
        }

        return {
          select: vi.fn(() => ({ in: projectIdsFilter })),
        };
      }),
    };
    const sbAdmin = {
      from: vi.fn((table: string) => {
        if (table !== 'workspace_boards') {
          throw new Error(`Unexpected admin-client table: ${table}`);
        }

        return {
          select: vi.fn(() => ({ eq: boardIdFilter })),
        };
      }),
    };

    mocks.createClient.mockResolvedValue(supabase);
    mocks.createAdminClient.mockResolvedValue(sbAdmin);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: { id: USER_ID },
    });
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  });

  it('rejects unauthenticated requests before resolving supplied IDs', async () => {
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: new Error('missing session'),
      user: null,
    });

    const response = await POST(request({ boardId: BOARD_ID }));

    expect(response.status).toBe(401);
    expect(boardIdFilter).not.toHaveBeenCalled();
    expect(projectIdsFilter).not.toHaveBeenCalled();
    expect(mocks.verifyWorkspaceMembershipType).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON', async () => {
    const response = await POST(
      new Request(
        'https://tasks.tuturuuu.com/api/v1/task-projects/resolve-workspace',
        { body: '{', method: 'POST' }
      )
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Malformed JSON body',
    });
  });

  it('requires at least one board or project ID', async () => {
    const response = await POST(request({}));

    expect(response.status).toBe(400);
    expect(boardIdFilter).not.toHaveBeenCalled();
    expect(projectIdsFilter).not.toHaveBeenCalled();
  });

  it('rejects more than 1000 project IDs before querying', async () => {
    const projectIds = Array.from(
      { length: 1001 },
      (_, index) =>
        `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`
    );

    const response = await POST(request({ projectIds }));

    expect(response.status).toBe(400);
    expect(projectIdsFilter).not.toHaveBeenCalled();
  });

  it('deduplicates project IDs before querying', async () => {
    const response = await POST(
      request({ projectIds: [PROJECT_ID, PROJECT_ID, OTHER_PROJECT_ID] })
    );

    expect(response.status).toBe(200);
    expect(projectIdsFilter).toHaveBeenCalledOnce();
    expect(projectIdsFilter).toHaveBeenCalledWith('id', [
      PROJECT_ID,
      OTHER_PROJECT_ID,
    ]);
  });

  it.each([
    { error: 'membership_missing' },
    { error: 'membership_type_mismatch', membershipType: 'GUEST' },
  ])(
    'returns a non-enumerating 404 when membership fails with $error',
    async (membership) => {
      mocks.verifyWorkspaceMembershipType.mockResolvedValue({
        ok: false,
        ...membership,
      });

      const response = await POST(request({ boardId: BOARD_ID }));

      await expectNoWorkspaceDisclosure(response, 404);
    }
  );

  it('returns a non-disclosing 500 when membership lookup fails', async () => {
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({
      error: 'membership_lookup_failed',
      ok: false,
    });

    const response = await POST(request({ boardId: BOARD_ID }));

    await expectNoWorkspaceDisclosure(response, 500);
  });

  it('returns the workspace for an authorized board', async () => {
    const response = await POST(request({ boardId: BOARD_ID }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      workspaceId: WORKSPACE_ID,
    });
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_ID, wsId: WORKSPACE_ID })
    );
  });

  it('returns the workspace for authorized projects', async () => {
    const response = await POST(request({ projectIds: [PROJECT_ID] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      workspaceId: WORKSPACE_ID,
    });
  });

  it('returns 404 without disclosure when no candidate is found', async () => {
    boardResult = { data: null, error: null };
    projectResult = { data: [], error: null };

    const response = await POST(
      request({ boardId: BOARD_ID, projectIds: [PROJECT_ID] })
    );

    await expectNoWorkspaceDisclosure(response, 404);
    expect(mocks.verifyWorkspaceMembershipType).not.toHaveBeenCalled();
  });

  it('preserves the conflict response for IDs from different workspaces', async () => {
    projectResult = { data: [{ ws_id: OTHER_WORKSPACE_ID }], error: null };

    const response = await POST(
      request({ boardId: BOARD_ID, projectIds: [PROJECT_ID] })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Conflicting workspaces for supplied IDs',
    });
    expect(mocks.verifyWorkspaceMembershipType).not.toHaveBeenCalled();
  });
});
