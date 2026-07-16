import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSatelliteAppSessionUser = vi.fn();
const handleGetApprovalsRequest = vi.fn();
const handlePutApprovalsRequest = vi.fn();

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser,
}));

vi.mock('@tuturuuu/users-core/routes/users/approvals/route', () => ({
  handleGetApprovalsRequest,
  handlePutApprovalsRequest,
}));

describe('Contacts approvals route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSatelliteAppSessionUser.mockResolvedValue({
      email: 'approver@example.com',
      id: 'platform-user-1',
    });
  });

  it.each([
    [
      'GET',
      () => import('./route').then((route) => route.GET),
      handleGetApprovalsRequest,
    ],
    [
      'PUT',
      () => import('./route').then((route) => route.PUT),
      handlePutApprovalsRequest,
    ],
  ])(
    'passes the Contacts app-session actor to %s approvals',
    async (_, load, handler) => {
      const response = new Response(null, { status: 204 });
      handler.mockResolvedValue(response);
      const context = { params: Promise.resolve({ wsId: 'workspace-1' }) };
      const request = new Request(
        'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/approvals'
      );
      const routeHandler = await load();

      await expect(routeHandler(request, context)).resolves.toBe(response);
      expect(getSatelliteAppSessionUser).toHaveBeenCalledWith('contacts');
      expect(handler).toHaveBeenCalledWith(request, context, {
        email: 'approver@example.com',
        id: 'platform-user-1',
      });
    }
  );

  it('rejects requests without a Contacts app session', async () => {
    getSatelliteAppSessionUser.mockResolvedValue(null);
    const { PUT } = await import('./route');
    const response = await PUT(
      new Request(
        'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-1/users/approvals'
      ),
      { params: Promise.resolve({ wsId: 'workspace-1' }) }
    );

    expect(response.status).toBe(401);
    expect(handlePutApprovalsRequest).not.toHaveBeenCalled();
  });
});
