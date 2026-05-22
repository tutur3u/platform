import { describe, expect, it, vi } from 'vitest';
import {
  repairWorkspaceUserPlatformLinks,
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
