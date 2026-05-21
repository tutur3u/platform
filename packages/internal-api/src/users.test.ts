import { describe, expect, it, vi } from 'vitest';
import { repairWorkspaceUserPlatformLinks } from './users';

function createJsonResponse(payload: unknown) {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

describe('users internal-api helpers', () => {
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
