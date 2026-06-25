import { describe, expect, it, vi } from 'vitest';
import { InternalApiError } from './client';
import {
  getWorkspaceUserGroupAttendanceShowManagers,
  listWorkspaceUserGroupAttendance,
  listWorkspaceUserGroupAttendanceMembers,
  saveWorkspaceUserGroupAttendance,
} from './user-group-attendance';

function createJsonResponse(payload: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;

  return {
    headers: new Headers(),
    json: async () => payload,
    ok: status >= 200 && status < 300,
    status,
  };
}

function getFetchInit(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
}

describe('user group attendance internal-api helpers', () => {
  it('lists group members through the existing user-group members endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        count: 1,
        data: [{ id: 'user-1', role: 'STUDENT' }],
        next: 1000,
      })
    );

    await expect(
      listWorkspaceUserGroupAttendanceMembers(
        'workspace 1',
        'group/1',
        { limit: 1000, offset: 0 },
        {
          baseUrl: 'https://internal.example.com',
          defaultHeaders: { cookie: 'session=abc' },
          fetch: fetchMock as unknown as typeof fetch,
        }
      )
    ).resolves.toEqual({
      count: 1,
      data: [{ id: 'user-1', role: 'STUDENT' }],
      next: 1000,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/workspace%201/user-groups/group%2F1/members?limit=1000&offset=0',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(new Headers(getFetchInit(fetchMock)?.headers).get('cookie')).toBe(
      'session=abc'
    );
  });

  it('lists attendance with the selected session query parameter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse([
        {
          id: 'attendance-1',
          notes: 'On time',
          session_id: 'session-1',
          status: 'PRESENT',
          user_id: 'user-1',
        },
      ])
    );

    await listWorkspaceUserGroupAttendance(
      'ws-1',
      'group-1',
      {
        date: '2026-01-12',
        sessionId: 'session-1',
      },
      {
        baseUrl: 'https://internal.example.com/',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/user-groups/group-1/attendance?date=2026-01-12&sessionId=session-1',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('serializes attendance updates with the legacy route payload shape', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(createJsonResponse({ message: 'success' }));

    await saveWorkspaceUserGroupAttendance(
      'ws-1',
      'group-1',
      [
        {
          date: '2026-01-12',
          notes: 'Late arrival',
          session_id: 'session-1',
          status: 'LATE',
          user_id: 'user-1',
        },
      ],
      {
        baseUrl: 'https://internal.example.com',
        defaultHeaders: { authorization: 'Bearer token' },
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/user-groups/group-1/attendance',
      expect.objectContaining({
        cache: 'no-store',
        method: 'POST',
      })
    );
    const headers = new Headers(getFetchInit(fetchMock)?.headers);
    expect(headers.get('authorization')).toBe('Bearer token');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(getFetchInit(fetchMock)?.body))).toEqual([
      {
        date: '2026-01-12',
        notes: 'Late arrival',
        session_id: 'session-1',
        status: 'LATE',
        user_id: 'user-1',
      },
    ]);
  });

  it('reuses the optional workspace config helper for show-managers defaults', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ value: 'false' }))
      .mockResolvedValueOnce(
        createJsonResponse({ message: 'missing' }, { status: 404 })
      );

    await expect(
      getWorkspaceUserGroupAttendanceShowManagers('ws-1', {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      })
    ).resolves.toBe(false);

    await expect(
      getWorkspaceUserGroupAttendanceShowManagers('ws-1', {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      })
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws-1/settings/ATTENDANCE_SHOW_MANAGERS',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('throws an InternalApiError with the response message when attendance loading fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createJsonResponse({ message: 'Invalid sessionId' }, { status: 400 })
      );

    let captured: unknown;
    try {
      await listWorkspaceUserGroupAttendance(
        'ws-1',
        'group-1',
        { date: '2026-01-12', sessionId: 'bad-session' },
        {
          baseUrl: 'https://internal.example.com',
          fetch: fetchMock as unknown as typeof fetch,
        }
      );
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(InternalApiError);
    expect((captured as InternalApiError).message).toBe('Invalid sessionId');
    expect((captured as InternalApiError).status).toBe(400);
  });
});
