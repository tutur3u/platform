import { describe, expect, it } from 'vitest';
import {
  APP_SESSION_COOKIE_NAME,
  createAppSessionTokenPair,
  verifyAppSessionRequest,
} from '../../../../packages/auth/src/app-session-core';
import { listWorkspaceInvitations } from '../../../../packages/internal-api/src/workspaces';
import { forwardToCentralApi } from '../../../../packages/start-bridge/src/core/api-forward';

const secret = 'tasks-invitation-test-only-secret';
const now = new Date('2026-11-11T00:00:00Z');

// Synthetic sessions exercise the transport boundary without a customer identity.
describe('Tasks invitation credential forwarding', () => {
  it.each(['cookie', 'bearer'] as const)(
    'preserves a valid Tasks %s session across the central hop',
    async (kind) => {
      const token = createAppSessionTokenPair(
        {
          targetApp: 'tasks',
          userId: 'fixture-actor',
        },
        { secret, now }
      ).access.token;
      const headers = new Headers();
    if (kind === 'cookie') {
      headers.set('cookie', `${APP_SESSION_COOKIE_NAME}=${token}`);
    } else {
      headers.set('authorization', `Bearer ${token}`);
    }
    const response = await forwardToCentralApi(
        new Request('https://tasks.tuturuuu.com/api/workspaces/invitations', {
          headers,
        }),
        'https://tuturuuu.com',
        {
          fetcher: async (input) => {
            const forwarded = input as Request;
            expect(forwarded.url).toBe(
              'https://tuturuuu.com/api/workspaces/invitations'
            );
            expect(forwarded.headers.get('host')).toBeNull();
            expect(
              verifyAppSessionRequest(forwarded, {
                targetApp: 'tasks',
                secret,
                now,
              }).ok
            ).toBe(true);
            expect(
              verifyAppSessionRequest(forwarded, {
                targetApp: 'tasks',
                secret: 'wrong',
                now,
              }).ok
            ).toBe(false);
            expect(
              verifyAppSessionRequest(forwarded, {
                targetApp: 'mail',
                secret,
                now,
              }).ok
            ).toBe(false);
            return Response.json({ invitations: [] });
          },
        }
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ invitations: [] });
    }
  );

  it('uses a same-origin browser path and propagates invitation401', async () => {
    await expect(
      listWorkspaceInvitations({
        fetch: async (input, init) => {
          expect(input).toBe('/api/workspaces/invitations');
          expect(init?.credentials).toBeUndefined();
          expect(init?.cache).toBe('no-store');
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        },
      })
    ).rejects.toMatchObject({ status: 401 });
  });
});
