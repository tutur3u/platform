import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MIRA_ACCOUNT_CONFIRMATION_VERSION } from '../../../../features/live-assistant/account-confirmation';
import { actorId, call, f, sessionId } from './phase-a-fixture';
import { POST as live } from './route';

const account = vi.hoisted(() => ({ marker: undefined as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: {
            user: {
              id,
              app_metadata: {
                meet_mira_account_confirmation: account.marker,
              },
            },
          },
        }),
      },
    },
  }),
}));
vi.mock('@opennextjs/cloudflare', async () =>
  (await import('./phase-a-fixture')).phaseAModules.cloudflare()
);
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', async () =>
  (await import('./phase-a-fixture')).phaseAModules.callAccess()
);
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', async () =>
  (await import('./phase-a-fixture')).phaseAModules.roomService()
);
vi.mock('../../../../features/live-assistant/server/demo-authority', async () =>
  (await import('./phase-a-fixture')).phaseAModules.demoAuthority()
);
vi.mock('@tuturuuu/meet-core/features/live-assistant/token', async () =>
  (await import('./phase-a-fixture')).phaseAModules.token()
);

const share = (enabled: boolean, extra: Record<string, unknown> = {}) =>
  call(live, { action: 'share', enabled, expectedActorId: actorId, ...extra });
const shareCalls = () =>
  f.callRoom.mock.calls
    .map(([, input]) => input)
    .filter(({ action }) => String(action).startsWith('mira.share.'));

beforeEach(() => {
  account.marker = undefined;
  const room = f.callRoom.getMockImplementation()!;
  f.callRoom.mockImplementation(async (access, input) =>
    String(input.action).startsWith('mira.share.')
      ? { enabled: input.enabled === true, revision: 1 }
      : room(access, input)
  );
});
afterEach(() => vi.unstubAllEnvs());

it('keeps sharing off and unreachable while the redesign flag is off', async () => {
  expect((await share(true)).status).toBe(404);
  expect(shareCalls()).toEqual([]);
});

// Runs before any confirmed account is cached for this file.
it('refuses unconfirmed or under-18 accounts but always lets them revoke', async () => {
  vi.stubEnv('MEET_UX_V2', 'true');
  expect((await share(true)).status).toBe(403);
  expect(shareCalls()).toEqual([]);
  const revoked = await share(false);
  expect(revoked.status).toBe(200);
  expect(await revoked.json()).toEqual({ enabled: false, revision: 1 });
  expect(shareCalls()).toEqual([{ action: 'mira.share.set', enabled: false }]);
});

it('never shares for someone else', async () => {
  vi.stubEnv('MEET_UX_V2', 'true');
  account.marker = MIRA_ACCOUNT_CONFIRMATION_VERSION;
  const other = '00000000-0000-4000-8000-000000000009';
  expect((await share(true, { accountId: other })).status).toBe(400);
  expect((await share(true, { expectedActorId: other })).status).toBe(403);
  expect(shareCalls()).toEqual([]);
});

it('lets a confirmed owner share with their own Private Mira', async () => {
  vi.stubEnv('MEET_UX_V2', 'true');
  account.marker = MIRA_ACCOUNT_CONFIRMATION_VERSION;
  const response = await share(true);
  expect(await response.json()).toEqual({ enabled: true, revision: 1 });
  expect(shareCalls()).toEqual([{ action: 'mira.share.set', enabled: true }]);

  const policy = await call(live, { action: 'policy' });
  expect(await policy.json()).toMatchObject({
    privateShare: { enabled: false, revision: 1 },
  });
});

it('ends the owner’s Private Mira voice session when they revoke', async () => {
  vi.stubEnv('MEET_UX_V2', 'true');
  f.sessions = [sessionId];
  const response = await share(false);
  expect(response.status).toBe(200);
  const stops = f.fetch.mock.calls
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)))
    .filter(({ action }) => action === 'stop');
  expect(stops).toEqual([
    expect.objectContaining({ action: 'stop', ownerId: actorId }),
  ]);
  expect(f.order).toContain('mira.private.ended');
  expect(f.sessions).toEqual([]);
});

