import { describe, expect, it, vi } from 'vitest';
import {
  cancelWorkspaceUserGroupSession,
  listWorkspaceUserGroupSessions,
  restoreWorkspaceUserGroupSession,
} from './user-group-schedule';

function response(payload: unknown = { data: [] }) {
  return {
    headers: new Headers(),
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

describe('user group schedule internal-api helpers', () => {
  it('requests cancelled sessions when historical entries are needed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());

    await listWorkspaceUserGroupSessions(
      'ws-1',
      { groupId: 'group-1', includeCancelled: true },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/user-groups/sessions?groupId=group-1&includeCancelled=true',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('soft-cancels one or future sessions and restores by explicit mutation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await cancelWorkspaceUserGroupSession(
      'ws-1',
      'session/1',
      { scope: 'future' },
      options
    );
    await restoreWorkspaceUserGroupSession('ws-1', 'session/1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/v1/workspaces/ws-1/user-groups/sessions/session%2F1?scope=future',
      expect.objectContaining({ cache: 'no-store', method: 'DELETE' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/v1/workspaces/ws-1/user-groups/sessions/session%2F1/restore',
      expect.objectContaining({ cache: 'no-store', method: 'POST' })
    );
  });
});
