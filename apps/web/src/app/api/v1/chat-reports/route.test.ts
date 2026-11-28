import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  callPrivateChatRpc: vi.fn(),
  resolveStaffActor: vi.fn(),
}));

vi.mock('@/app/api/v1/product-feedback/staff-access', () => {
  class StaffReadError extends Error {
    constructor(readonly status: 401 | 403 | 503) {
      super('staff');
    }
  }
  return {
    StaffReadError,
    resolveStaffActor: (...args: unknown[]) => mocks.resolveStaffActor(...args),
  };
});

vi.mock('@/lib/chat/private-rpc', () => ({
  callPrivateChatRpc: (...args: unknown[]) => mocks.callPrivateChatRpc(...args),
  chatRpcErrorResponse: () =>
    Response.json({ message: 'failed' }, { status: 500 }),
}));

const STAFF = '00000000-0000-4000-8000-0000000000aa';
const REPORT = '00000000-0000-4000-8000-0000000000bb';

describe('staff chat reports queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveStaffActor.mockResolvedValue(STAFF);
  });

  it('passes the verified staff actor to SQL, which re-checks the registry', async () => {
    mocks.callPrivateChatRpc.mockResolvedValueOnce([{ id: REPORT }]);
    const { GET } = await import('./route');
    const response = await GET(
      new Request('https://test/api/v1/chat-reports?status=open')
    );

    expect(response.status).toBe(200);
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_list_content_reports',
      { p_actor_user_id: STAFF, p_limit: 50, p_status: 'open' }
    );
  });

  it('maps the SQL staff refusal to 403', async () => {
    mocks.callPrivateChatRpc.mockRejectedValueOnce({ code: 'PT403' });
    const { GET } = await import('./route');
    const response = await GET(new Request('https://test/api/v1/chat-reports'));
    expect(response.status).toBe(403);
  });

  it('refuses non-staff before any SQL call', async () => {
    const { StaffReadError } = await import(
      '@/app/api/v1/product-feedback/staff-access'
    );
    mocks.resolveStaffActor.mockRejectedValueOnce(new StaffReadError(403));
    const { PATCH } = await import('./route');
    const response = await PATCH(
      new Request('https://test/api/v1/chat-reports', {
        body: JSON.stringify({ reportId: REPORT, status: 'dismissed' }),
        method: 'PATCH',
      })
    );
    expect(response.status).toBe(403);
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();
  });

  it('records the reviewer as the staff actor', async () => {
    mocks.callPrivateChatRpc.mockResolvedValueOnce({
      id: REPORT,
      status: 'actioned',
    });
    const { PATCH } = await import('./route');
    await PATCH(
      new Request('https://test/api/v1/chat-reports', {
        body: JSON.stringify({
          reportId: REPORT,
          status: 'actioned',
          note: ' removed ',
          reviewerUserId: 'forged',
        }),
        method: 'PATCH',
      })
    );
    // Unknown fields are refused by the strict schema.
    expect(mocks.callPrivateChatRpc).not.toHaveBeenCalled();

    await PATCH(
      new Request('https://test/api/v1/chat-reports', {
        body: JSON.stringify({
          reportId: REPORT,
          status: 'actioned',
          note: ' removed ',
        }),
        method: 'PATCH',
      })
    );
    expect(mocks.callPrivateChatRpc).toHaveBeenCalledWith(
      'chat_review_content_report',
      {
        p_note: 'removed',
        p_report_id: REPORT,
        p_reviewer_user_id: STAFF,
        p_status: 'actioned',
      }
    );
  });
});
