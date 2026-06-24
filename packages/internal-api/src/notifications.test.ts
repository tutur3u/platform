import { describe, expect, it, vi } from 'vitest';
import {
  listAccountNotificationPreferences,
  listWorkspaceNotificationPreferences,
  updateAccountNotificationPreferences,
  updateWorkspaceNotificationPreferences,
} from './notifications';

function createJsonResponse(payload: unknown) {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

function getFetchInit(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
}

describe('notification internal-api helpers', () => {
  it('reads workspace preferences with the workspace query parameter', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        preferences: [
          {
            channel: 'web',
            created_at: '2026-06-24T00:00:00.000Z',
            enabled: true,
            event_type: 'task_assigned',
            id: 'pref-1',
            updated_at: '2026-06-24T00:00:00.000Z',
            user_id: 'user-1',
            ws_id: 'workspace 1',
          },
        ],
      })
    );

    const result = await listWorkspaceNotificationPreferences('workspace 1', {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(result.preferences).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/notifications/preferences?wsId=workspace+1',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('updates workspace preferences with the legacy request body shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        success: true,
      })
    );

    await updateWorkspaceNotificationPreferences(
      'ws-1',
      [
        {
          channel: 'email',
          enabled: false,
          eventType: 'workspace_invite',
        },
      ],
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/notifications/preferences',
      expect.objectContaining({
        method: 'PUT',
      })
    );
    expect(
      new Headers(getFetchInit(fetchMock)?.headers).get('Content-Type')
    ).toBe('application/json');
    expect(JSON.parse(String(getFetchInit(fetchMock)?.body))).toEqual({
      preferences: [
        {
          channel: 'email',
          enabled: false,
          eventType: 'workspace_invite',
        },
      ],
      wsId: 'ws-1',
    });
  });

  it('reads and updates account preferences through the account endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          preferences: [],
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          success: true,
        })
      );

    await expect(
      listAccountNotificationPreferences({
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      })
    ).resolves.toEqual({ preferences: [] });

    await updateAccountNotificationPreferences(
      [
        {
          channel: 'push',
          enabled: true,
          eventType: 'security_alerts',
        },
      ],
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/notifications/account-preferences',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/notifications/account-preferences',
      expect.objectContaining({
        method: 'PUT',
      })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      preferences: [
        {
          channel: 'push',
          enabled: true,
          eventType: 'security_alerts',
        },
      ],
    });
  });
});
