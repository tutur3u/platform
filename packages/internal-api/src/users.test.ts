import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getUserConfig,
  getUserWorkspaceConfig,
  repairWorkspaceUserPlatformLinks,
  TASK_DEFAULT_BOARD_ID_CONFIG_ID,
  updateUserConfig,
  updateUserWorkspaceConfig,
} from './users';

function createJsonResponse(payload: unknown) {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

describe('users internal-api helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('saves nullable user config payloads through the stable route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({}));

    await updateUserConfig('SIDEBAR_NAVIGATION_LAYOUT', null, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/users/me/configs/SIDEBAR_NAVIGATION_LAYOUT',
      expect.objectContaining({
        body: JSON.stringify({
          value: null,
        }),
        method: 'PUT',
      })
    );
  });

  it('routes task-scoped user configs through the tasks API origin', async () => {
    vi.stubEnv('TASKS_APP_URL', 'https://tasks.example.com');
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        value: 'compact',
      })
    );

    await getUserConfig('TASK_DIALOG_DEFAULT_PRESENTATION', {
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tasks.example.com/api/v1/users/me/configs/TASK_DIALOG_DEFAULT_PRESENTATION',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('routes task-scoped workspace configs through the tasks API origin', async () => {
    vi.stubEnv('TASKS_APP_URL', 'https://tasks.example.com');
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        value: 'board-1',
      })
    );

    await getUserWorkspaceConfig('ws-1', TASK_DEFAULT_BOARD_ID_CONFIG_ID, {
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tasks.example.com/api/v1/users/me/workspaces/ws-1/configs/TASK_DEFAULT_BOARD_ID',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('resets nullable user workspace config payloads through the stable route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({}));

    await updateUserWorkspaceConfig('ws-1', 'SIDEBAR_NAVIGATION_LAYOUT', null, {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/users/me/workspaces/ws-1/configs/SIDEBAR_NAVIGATION_LAYOUT',
      expect.objectContaining({
        body: JSON.stringify({
          value: null,
        }),
        cache: 'no-store',
        method: 'PUT',
      })
    );
  });

  it('repairs workspace user platform links through the stable route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        linked: [],
        skipped: [],
        summary: {
          linked: 0,
          scanned: 0,
          skipped: 0,
        },
      })
    );

    await repairWorkspaceUserPlatformLinks(
      'ws-1',
      {
        workspaceUserId: 'user-1',
      },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/workspaces/ws-1/users/links/repair',
      expect.objectContaining({
        body: JSON.stringify({
          workspaceUserId: 'user-1',
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });
});
