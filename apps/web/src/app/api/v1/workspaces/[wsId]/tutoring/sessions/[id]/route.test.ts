// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionId = 'f0747f37-bf6d-4263-a5df-a11c57bdc762';
const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
}));

let deleting = false;
let status: 'PENDING' | 'CANCELLED' | 'DONE' | null = 'PENDING';
let deleted = true;
const query = {
  delete: vi.fn(() => {
    deleting = true;
    return query;
  }),
  eq: vi.fn(() => query),
  in: vi.fn(() => query),
  maybeSingle: vi.fn(async () => ({
    data: deleting
      ? deleted
        ? { id: sessionId }
        : null
      : status
        ? { id: sessionId, attendance_status: status }
        : null,
    error: null,
  })),
  select: vi.fn(() => query),
};

vi.mock('next/server', () => ({
  NextResponse: { json: Response.json },
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({}),
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => wsId,
  getPermissions: mocks.getPermissions,
}));

async function deleteSession() {
  const { DELETE } = await import('./route');
  return DELETE(
    new Request(
      `http://localhost/api/v1/workspaces/${wsId}/tutoring/sessions/${sessionId}`,
      { method: 'DELETE' }
    ),
    { params: Promise.resolve({ id: sessionId, wsId }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  deleting = false;
  deleted = true;
  status = 'PENDING';
  mocks.getPermissions.mockResolvedValue({
    withoutPermission: () => false,
  });
  mocks.createAdminClient.mockResolvedValue({
    schema: () => ({ from: () => query }),
  });
});

describe('DELETE tutoring session', () => {
  it('rejects callers without management permission before using admin access', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: () => true,
    });

    const response = await deleteSession();

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('scopes the lookup to the workspace and returns 404 when missing', async () => {
    status = null;

    const response = await deleteSession();

    expect(response.status).toBe(404);
    expect(query.eq).toHaveBeenCalledWith('id', sessionId);
    expect(query.eq).toHaveBeenCalledWith('ws_id', wsId);
    expect(query.delete).not.toHaveBeenCalled();
  });

  it('preserves completed sessions', async () => {
    status = 'DONE';

    const response = await deleteSession();

    expect(response.status).toBe(409);
    expect(query.delete).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'CANCELLED'] as const)(
    'deletes a %s session with a status guard',
    async (attendanceStatus) => {
      status = attendanceStatus;

      const response = await deleteSession();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ message: 'success' });
      expect(query.in).toHaveBeenCalledWith('attendance_status', [
        'PENDING',
        'CANCELLED',
      ]);
      expect(query.eq).toHaveBeenCalledWith('ws_id', wsId);
    }
  );

  it('reports a race when the status changes before deletion', async () => {
    deleted = false;

    const response = await deleteSession();

    expect(response.status).toBe(409);
  });
});
