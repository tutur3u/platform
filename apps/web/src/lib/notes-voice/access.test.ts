import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), membership: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  resolveWorkspaceIdForPrincipal: mocks.resolve,
  verifyWorkspaceMembershipType: mocks.membership,
}));

import { notesVoiceWorkspace } from './access';

const client = {} as TypedSupabaseClient;
beforeEach(() => {
  vi.resetAllMocks();
});
describe('Notes voice workspace authorization', () => {
  it('resolves personal aliases using the authenticated principal and verifies membership', async () => {
    mocks.resolve.mockResolvedValue('personal-workspace');
    mocks.membership.mockResolvedValue({ ok: true });
    expect(await notesVoiceWorkspace(client, { id: 'actor' }, 'personal')).toBe(
      'personal-workspace'
    );
    expect(mocks.resolve).toHaveBeenCalledWith({
      authorizationClient: client,
      principal: { id: 'actor', email: null },
      wsId: 'personal',
    });
    expect(mocks.membership).toHaveBeenCalledWith({
      supabase: client,
      userId: 'actor',
      wsId: 'personal-workspace',
    });
  });
  it.each([
    [{ ok: false }, 403, 'workspace_denied'],
    [
      { ok: false, error: 'membership_lookup_failed' },
      503,
      'membership_unavailable',
    ],
  ])(
    'preserves denied vs unavailable membership',
    async (membership, status, code) => {
      mocks.resolve.mockResolvedValue('workspace');
      mocks.membership.mockResolvedValue(membership);
      await expect(
        notesVoiceWorkspace(client, { id: 'actor' }, 'workspace')
      ).rejects.toMatchObject({ status, code });
    }
  );
  it('stops before membership queries when no authorized workspace resolves', async () => {
    mocks.resolve.mockResolvedValue(null);
    await expect(
      notesVoiceWorkspace(client, { id: 'actor' }, 'missing')
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.membership).not.toHaveBeenCalled();
  });
});
