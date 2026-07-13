import { describe, expect, it, vi } from 'vitest';
import {
  clearUserGroupPostChecks,
  createUserGroupPostCheck,
  listUserGroupPostCheckLogs,
  updateUserGroupPostChecks,
} from './posts';

const BASE_URL = 'https://contacts.tuturuuu.com';
const WS_ID = 'workspace/with spaces';
const GROUP_ID = 'group/one';
const POST_ID = 'post/one';

function response(body: unknown = { message: 'success' }) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

describe('user group post checks client', () => {
  it('creates a completion check through the Contacts-owned collection route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    const payload = {
      is_completed: true,
      notes: 'Finished',
      post_id: POST_ID,
      user_id: 'user-1',
    };

    await createUserGroupPostCheck(WS_ID, GROUP_ID, payload, {
      baseUrl: BASE_URL,
      fetch: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/workspaces/workspace%2Fwith%20spaces/user-groups/group%2Fone/group-checks`,
      expect.objectContaining({
        body: JSON.stringify(payload),
        method: 'POST',
      })
    );
  });

  it('updates several completion checks through the post route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    const payload = [
      { is_completed: true, user_id: 'user-1' },
      { is_completed: false, user_id: 'user-2' },
    ];

    await updateUserGroupPostChecks(WS_ID, GROUP_ID, POST_ID, payload, {
      baseUrl: BASE_URL,
      fetch: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/workspaces/workspace%2Fwith%20spaces/user-groups/group%2Fone/group-checks/post%2Fone`,
      expect.objectContaining({
        body: JSON.stringify(payload),
        method: 'PUT',
      })
    );
  });

  it('clears completion checks through the post route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());

    await clearUserGroupPostChecks(
      WS_ID,
      GROUP_ID,
      POST_ID,
      ['user-1', 'user-2'],
      { baseUrl: BASE_URL, fetch: fetchMock }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/workspaces/workspace%2Fwith%20spaces/user-groups/group%2Fone/group-checks/post%2Fone`,
      expect.objectContaining({
        body: JSON.stringify({ user_ids: ['user-1', 'user-2'] }),
        method: 'DELETE',
      })
    );
  });

  it('loads completion history through the Contacts-owned logs route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ logs: [] }));

    await listUserGroupPostCheckLogs(WS_ID, GROUP_ID, POST_ID, {
      baseUrl: BASE_URL,
      fetch: fetchMock,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/workspaces/workspace%2Fwith%20spaces/user-groups/group%2Fone/group-checks/post%2Fone/logs`,
      expect.objectContaining({ cache: 'no-store' })
    );
  });
});
