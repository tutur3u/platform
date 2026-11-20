import { expect, it, vi } from 'vitest';
import {
  actorId,
  bind,
  call,
  f,
  meetingId,
  sessionId,
  version,
} from './phase-a-fixture';
import { POST as review } from './review/route';
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

it('denies room start before env, consent, token, or Durable Object work', async () => {
  f.cloudflare.mockRejectedValue(new Error('Synthetic bindings unavailable'));
  const response = await call(live, {
    action: 'start',
    mode: 'room',
    timezone: 'UTC',
    audioPolicy: 'participant-opt-in',
  });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({
    error:
      'Room Mira is unavailable. Use Private Mira after choosing Continue.',
  });
  expect(f.cloudflare).not.toHaveBeenCalled();
  expect(f.sign).not.toHaveBeenCalled();
  expect(f.fetch).not.toHaveBeenCalled();
});
it('refuses a private token before a persisted current account click', async () => {
  for (const choice of [
    null,
    { ...f.choice!, choice: 'mute' },
    { ...f.choice!, accountId: 'another' },
    { ...f.choice!, meetingId: 'another' },
  ]) {
    f.choice = choice;
    expect(
      (await call(live, { action: 'start', mode: 'personal', timezone: 'UTC' }))
        .status
    ).toBe(403);
  }
  expect(f.sign).not.toHaveBeenCalled();
  expect(f.fetch).not.toHaveBeenCalled();
});
it('keeps kill switch and absent explicit enable off for a qualified actor', async () => {
  for (const disabled of ['true', '', undefined]) {
    bind(disabled);
    expect(
      (await call(live, { action: 'start', mode: 'personal', timezone: 'UTC' }))
        .status
    ).toBe(403);
  }
  expect(f.sign).not.toHaveBeenCalled();
});
it('does not admit an unattested team or guest even when a choice exists', async () => {
  f.authorized = false;
  expect(
    (await call(live, { action: 'start', mode: 'personal', timezone: 'UTC' }))
      .status
  ).toBe(403);
  f.authorized = true;
  f.member = false;
  expect(
    (await call(live, { action: 'start', mode: 'personal', timezone: 'UTC' }))
      .status
  ).toBe(403);
  expect(f.fetch).not.toHaveBeenCalled();
});
it('records mute only after private stop succeeds, and never mints a token for a choice', async () => {
  f.sessions = [sessionId];
  const response = await call(live, {
    action: 'choice',
    choice: 'mute',
    version,
  });
  expect(response.status).toBe(200);
  expect(f.order.indexOf('stop')).toBeLessThan(
    f.order.indexOf('mira.private.choice')
  );
  expect(f.sign).not.toHaveBeenCalled();
});
it('does not persist mute after an uncertain stop', async () => {
  f.sessions = [sessionId];
  f.fetch.mockResolvedValue(new Response(null, { status: 503 }));
  expect(
    (await call(live, { action: 'choice', choice: 'mute', version })).status
  ).toBe(503);
  expect(f.order).not.toContain('mira.private.choice');
});
it('rejects a stale notice version and disables room/workspace review', async () => {
  expect(
    (
      await call(live, {
        action: 'choice',
        choice: 'continue',
        version: 'stale',
      })
    ).status
  ).toBe(400);
  expect(
    (await call(review, { sessionId, reviewId: meetingId, approved: true }))
      .status
  ).toBe(403);
  expect(f.sign).not.toHaveBeenCalled();
});

it('rejects legacy public and private mention bodies without forwarding any author or history', async () => {
  const { POST: publicChat } =
    await import('../../meet-call/[meetingId]/assistant/route');
  const { POST: privateChat } =
    await import('../../meet-call/[meetingId]/assistant/personal/route');
  // Room chat accepts only a stored room message id; legacy free-form
  // bodies are invalid before any authority, context or provider work.
  for (const [handler, status] of [
    [publicChat, 400],
    [privateChat, 403],
  ] as const)
    for (const body of ['@Tuturuuu hello', '@ttr hello', '@mira hello'])
      expect(
        (
          await call(handler, {
            body,
            audience: 'everyone',
            history: [{ author: 'other', text: 'excluded' }],
          })
        ).status
      ).toBe(status);
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.sign).not.toHaveBeenCalled();
});

it('rejects recovery consent for a different account before touching its choice', async () => {
  const response = await call(live, {
    action: 'choice',
    choice: 'continue',
    version,
    expectedActorId: sessionId,
  });
  expect(sessionId).not.toBe(actorId);
  expect(response.status).toBe(403);
  expect(f.callRoom).not.toHaveBeenCalled();
});

it('does not record recovery consent for an ineligible workspace', async () => {
  f.authorized = false;
  const response = await call(live, {
    action: 'choice',
    choice: 'continue',
    version,
    expectedActorId: actorId,
  });
  expect(response.status).toBe(403);
  expect(f.callRoom.mock.calls).toHaveLength(1);
  expect(f.callRoom.mock.calls[0]?.[1]).toEqual({
    action: 'mira.private.read',
  });
});
