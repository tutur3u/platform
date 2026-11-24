import { describe, expect, it, vi } from 'vitest';
import {
  AccountDeletionLastManagerError,
  deleteCurrentUserAccount,
  getCurrentUserAccountDeletePrecheck,
  isAccountDeletionLastManagerError,
} from './account-delete';
import { InternalApiError } from './internal-api-error';

function createJsonResponse(payload: unknown, status = 200) {
  return {
    headers: new Headers(),
    json: async () => payload,
    ok: status >= 200 && status < 300,
    status,
  };
}

const clientOptions = (fetchMock: ReturnType<typeof vi.fn>) => ({
  baseUrl: 'https://internal.example.com',
  fetch: fetchMock as unknown as typeof fetch,
});

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

  it('maps the last member-manager refusal to a typed error with workspaces', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createJsonResponse(
        {
          code: 'ACCOUNT_DELETION_LAST_MANAGER',
          message:
            'Give another member member-management access, or delete the workspace first',
          workspaces: [
            { id: 'team-workspace', name: 'Team' },
            { id: 42, name: 'Malformed' },
          ],
        },
        409
      )
    );

    const error = await deleteCurrentUserAccount(
      { email: 'member@example.com' },
      clientOptions(fetchMock)
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AccountDeletionLastManagerError);
    expect(error).toBeInstanceOf(InternalApiError);
    expect(isAccountDeletionLastManagerError(error)).toBe(true);
    expect(error).toMatchObject({
      code: 'ACCOUNT_DELETION_LAST_MANAGER',
      message:
        'Give another member member-management access, or delete the workspace first',
      status: 409,
      workspaces: [{ id: 'team-workspace', name: 'Team' }],
    });
  });

  it('keeps other conflicts as plain internal API errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createJsonResponse(
          { message: 'Cannot delete account with active paid subscriptions' },
          409
        )
      );

    const error = await deleteCurrentUserAccount(
      { email: 'member@example.com' },
      clientOptions(fetchMock)
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(InternalApiError);
    expect(isAccountDeletionLastManagerError(error)).toBe(false);
    expect(error).toMatchObject({ status: 409 });
  });

  it('keeps non-conflict failures as internal API errors', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createJsonResponse(
          { message: 'Email address does not match your account' },
          400
        )
      );

    await expect(
      deleteCurrentUserAccount(
        { email: 'member@example.com' },
        clientOptions(fetchMock)
      )
    ).rejects.toMatchObject({
      message: 'Email address does not match your account',
      status: 400,
    });
  });
});
