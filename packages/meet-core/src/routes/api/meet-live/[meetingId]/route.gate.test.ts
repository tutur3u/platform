import { expect, it } from 'vitest';
import {
  f,
  live,
  review,
  call,
  bind,
  sessionId,
  version,
  meetingId,
} from './phase-a-fixture';
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

it('denies every public and legacy private mention without forwarding any author or history', async () => {
  const { POST: publicChat } =
    await import('../../meet-call/[meetingId]/assistant/route');
  const { POST: privateChat } =
    await import('../../meet-call/[meetingId]/assistant/personal/route');
  for (const handler of [publicChat, privateChat])
    for (const body of ['@Tuturuuu hello', '@ttr hello', '@mira hello'])
      expect(
        (
          await call(handler, {
            body,
            audience: 'everyone',
            history: [{ author: 'other', text: 'excluded' }],
          })
        ).status
      ).toBe(403);
  expect(f.fetch).not.toHaveBeenCalled();
  expect(f.sign).not.toHaveBeenCalled();
});
