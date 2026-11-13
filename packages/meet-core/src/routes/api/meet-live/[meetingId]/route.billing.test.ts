import { expect, it, vi } from 'vitest';
import { actorId, call, f, meetingId, version } from './phase-a-fixture';
import { POST as live } from './route';

vi.mock('server-only', () => ({}));
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

it('mints a private account/meeting scoped token after choice confirmation and keeps personal billing', async () => {
  const response = await call(live, {
    action: 'start',
    mode: 'personal',
    timezone: 'UTC',
    workspaceId: '00000000-0000-4000-8000-000000000099',
  });
  expect(response.status).toBe(200);
  expect(f.claims).toMatchObject({
    mode: 'personal',
    ownerId: actorId,
    meetingId,
    billingWorkspaceId: '00000000-0000-4000-8000-000000000003',
    inputSource: 'private-microphone',
    consentVersion: version,
    consentRevision: 1,
    workspaceAuthority: 'verified-personal',
  });
  expect(Number(f.claims.expiresAt) - Date.now()).toBeLessThanOrEqual(120000);
  expect(
    f.order.filter((value) => value === 'mira.private.read').length
  ).toBeGreaterThanOrEqual(2);
  expect(f.order.at(-1)).toBe('token');
});
it('does not seed private Mira with any room context, other authors or workspace tools', async () => {
  await call(live, { action: 'start', mode: 'personal', timezone: 'UTC' });
  const init = f.fetch.mock.calls.find(([url]) => url.endsWith('/initialize'));
  expect(init).toBeDefined();
  const body = JSON.parse(String(init![1].body));
  expect(body.sharedContext).toBe('');
  expect(body.scenarioInstructions).toBeUndefined();
  expect(body.workspace).toBeUndefined();
  expect(
    f.callRoom.mock.calls.some(([, input]) => input.action === 'live.context')
  ).toBe(false);
});
