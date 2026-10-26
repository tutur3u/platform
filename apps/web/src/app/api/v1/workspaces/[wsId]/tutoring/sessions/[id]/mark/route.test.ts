// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionId = 'f0747f37-bf6d-4263-a5df-a11c57bdc762';
const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  notifyCompletionSafely: vi.fn(),
}));

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
vi.mock('@/lib/tutoring/completion-notification', () => ({
  notifyCompletionSafely: mocks.notifyCompletionSafely,
}));

const query = {
  eq: vi.fn(() => query),
  maybeSingle: vi.fn(
    async (): Promise<{ data: { id: string } | null; error: null }> => ({
      data: { id: sessionId },
      error: null,
    })
  ),
  select: vi.fn(() => query),
  update: vi.fn(() => query),
};

async function mark(attendanceStatus: string) {
  const { POST } = await import('./route');
  return POST(
    new Request(
      `http://localhost/api/v1/workspaces/${wsId}/tutoring/sessions/${sessionId}/mark`,
      { method: 'POST', body: JSON.stringify({ attendanceStatus }) }
    ),
    { params: Promise.resolve({ id: sessionId, wsId }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.notifyCompletionSafely.mockResolvedValue(undefined);
  mocks.createAdminClient.mockResolvedValue({
    schema: () => ({ from: () => query }),
  });
  mocks.getPermissions.mockResolvedValue({
    wsId,
    withoutPermission: () => false,
  });
});

describe('mark tutoring session', () => {
  it('notifies homeroom teachers after a completion is saved', async () => {
    const response = await mark('DONE');

    expect(response.status).toBe(200);
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ attendance_status: 'DONE' })
    );
    expect(mocks.notifyCompletionSafely).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId, wsId })
    );
  });

  it('does not notify for other statuses', async () => {
    expect((await mark('NO_SHOW')).status).toBe(200);
    expect(mocks.notifyCompletionSafely).not.toHaveBeenCalled();
  });

  it('does not notify when the session was not updated', async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect((await mark('DONE')).status).toBe(404);
    expect(mocks.notifyCompletionSafely).not.toHaveBeenCalled();
  });
});
