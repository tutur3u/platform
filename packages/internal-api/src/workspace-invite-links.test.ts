import { describe, expect, it, vi } from 'vitest';
import type { InternalApiError } from './client';
import {
  createWorkspaceInviteLink,
  deleteWorkspaceInviteLink,
  getWorkspaceInviteLink,
  listWorkspaceInviteLinks,
  updateWorkspaceInviteLink,
} from './workspace-invite-links';

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

describe('workspace invite link internal-api helpers', () => {
  it('encodes workspace and link ids for list and detail reads', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ id: 'link/1' }));
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };

    await listWorkspaceInviteLinks('workspace 1', options);
    await getWorkspaceInviteLink('workspace 1', 'link/1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/workspaces/workspace%201/invite-links',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/workspaces/workspace%201/invite-links/link%2F1',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('sends create, update, and delete mutations with the existing API shape', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ id: 'link-1' }, 201))
      .mockResolvedValueOnce(response({ id: 'link-1' }))
      .mockResolvedValueOnce(response({ message: 'deleted' }));
    const options = {
      baseUrl: 'https://internal.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    };
    const payload = {
      expiresAt: '2026-08-01T00:00:00.000Z',
      maxUses: 12,
      memberType: 'GUEST' as const,
    };

    await createWorkspaceInviteLink('ws-1', payload, options);
    await updateWorkspaceInviteLink('ws-1', 'link-1', payload, options);
    await deleteWorkspaceInviteLink('ws-1', 'link-1', options);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://internal.example.com/api/workspaces/ws-1/invite-links',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://internal.example.com/api/workspaces/ws-1/invite-links/link-1',
      expect.objectContaining({ method: 'PATCH' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://internal.example.com/api/workspaces/ws-1/invite-links/link-1',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual(
      payload
    );
  });

  it('preserves seat-limit error codes for actionable UI feedback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(
        {
          errorCode: 'SEAT_LIMIT_REACHED',
          message: 'Add more seats before creating another invitation.',
        },
        403
      )
    );

    await expect(
      createWorkspaceInviteLink(
        'ws-1',
        { memberType: 'MEMBER' },
        {
          baseUrl: 'https://internal.example.com',
          fetch: fetchMock as unknown as typeof fetch,
        }
      )
    ).rejects.toMatchObject<Partial<InternalApiError>>({
      code: 'SEAT_LIMIT_REACHED',
      message: 'Add more seats before creating another invitation.',
      status: 403,
    });
  });
});
