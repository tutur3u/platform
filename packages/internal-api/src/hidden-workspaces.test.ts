import { describe, expect, it, vi } from 'vitest';
import {
  getCurrentUserHiddenWorkspaces,
  updateCurrentUserHiddenWorkspace,
} from './users';

describe('Hidden preferences through the users export', () => {
  it('uses the actor-bound owner read without retaining an HTTP cache', async () => {
    const payload = { hiddenWorkspaceIds: ['synthetic-workspace'] };
    const transport = vi.fn().mockResolvedValue(Response.json(payload));
    expect(
      await getCurrentUserHiddenWorkspaces('actor/a', {
        baseUrl: 'https://synthetic.example',
        fetch: transport,
      })
    ).toEqual(payload);
    expect(transport).toHaveBeenCalledWith(
      'https://synthetic.example/api/v1/users/me/hidden-workspaces?expectedActorId=actor%2Fa',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('preserves the expected actor and workspace ID in a synthetic update', async () => {
    const payload = { workspaceId: 'synthetic-workspace', hidden: true };
    const transport = vi.fn().mockResolvedValue(Response.json(payload));
    expect(
      await updateCurrentUserHiddenWorkspace(
        payload.workspaceId,
        payload.hidden,
        'synthetic-actor',
        { baseUrl: 'https://synthetic.example', fetch: transport }
      )
    ).toEqual(payload);
    expect(transport).toHaveBeenCalledWith(
      'https://synthetic.example/api/v1/users/me/hidden-workspaces',
      expect.objectContaining({
        method: 'PUT',
        cache: 'no-store',
        body: JSON.stringify({
          ...payload,
          expectedActorId: 'synthetic-actor',
        }),
      })
    );
  });
});
