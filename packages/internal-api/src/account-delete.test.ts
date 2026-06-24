import { describe, expect, it, vi } from 'vitest';
import {
  deleteCurrentUserAccount,
  getCurrentUserAccountDeletePrecheck,
} from './account-delete';

function createJsonResponse(payload: unknown) {
  return {
    json: async () => payload,
    ok: true,
    status: 200,
  };
}

describe('account deletion internal-api helpers', () => {
  it('loads the current user deletion precheck through the stable route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        blockingWorkspaces: [],
        canDelete: true,
        cleanupSummary: {
          seatsToRevoke: 0,
          workspacesToDelete: 0,
        },
      })
    );

    await getCurrentUserAccountDeletePrecheck({
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/users/me/delete',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('posts the confirmation email through the stable route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse({
        message: 'Account deleted successfully',
      })
    );

    await deleteCurrentUserAccount(
      { email: 'member@example.com' },
      {
        baseUrl: 'https://internal.example.com',
        fetch: fetchMock as unknown as typeof fetch,
      }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://internal.example.com/api/v1/users/me/delete',
      expect.objectContaining({
        body: JSON.stringify({ email: 'member@example.com' }),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });
});
