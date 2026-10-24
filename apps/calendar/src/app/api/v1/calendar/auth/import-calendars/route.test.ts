import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  calendarListMock,
  fromMock,
  resolveSessionAuthContextMock,
  verifyWorkspaceMembershipTypeMock,
} = vi.hoisted(() => ({
  calendarListMock: vi.fn(),
  fromMock: vi.fn(),
  resolveSessionAuthContextMock: vi.fn(),
  verifyWorkspaceMembershipTypeMock: vi.fn(),
}));

vi.mock('@tuturuuu/google', () => ({
  google: {
    auth: {
      OAuth2: vi.fn(function OAuth2(this: { setCredentials: () => void }) {
        this.setCredentials = vi.fn();
      }),
    },
    calendar: vi.fn(() => ({ calendarList: { list: calendarListMock } })),
  },
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: verifyWorkspaceMembershipTypeMock,
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: resolveSessionAuthContextMock,
}));

import { POST } from './route';

function importRequest(wsId = 'workspace-1') {
  return new Request(
    'https://calendar.tuturuuu.com/api/v1/calendar/auth/import-calendars',
    { body: JSON.stringify({ wsId }), method: 'POST' }
  );
}

describe('Google Calendar import route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    resolveSessionAuthContextMock.mockResolvedValue({
      ok: true,
      supabase: { from: fromMock },
      user: { id: 'user-1' },
    });
  });

  it('rejects non-members before reading tokens or writing connections', async () => {
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({
      ok: false,
      error: 'membership_missing',
    });

    const response = await POST(importRequest());

    expect(response.status).toBe(403);
    expect(verifyWorkspaceMembershipTypeMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', wsId: 'workspace-1' })
    );
    expect(fromMock).not.toHaveBeenCalled();
    expect(calendarListMock).not.toHaveBeenCalled();
  });

  it('fails closed when the membership lookup fails', async () => {
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({
      ok: false,
      error: 'membership_lookup_failed',
    });

    const response = await POST(importRequest());

    expect(response.status).toBe(500);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated requests', async () => {
    resolveSessionAuthContextMock.mockResolvedValue({ ok: false });

    const response = await POST(importRequest());

    expect(response.status).toBe(401);
    expect(verifyWorkspaceMembershipTypeMock).not.toHaveBeenCalled();
  });
});
