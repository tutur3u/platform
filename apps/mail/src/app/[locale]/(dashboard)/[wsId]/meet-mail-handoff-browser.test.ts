// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest';
import type { MeetMailHandoff } from '@tuturuuu/utils/meet-mail-handoff';
import { claimMeetMailHandoff } from './meet-mail-handoff-browser';
const value = (): MeetMailHandoff => ({
  v: 1,
  source: 'meet',
  id: crypto.randomUUID(),
  issuedAt: Date.now(),
  actorId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  subject: 'Private title',
  joinUrl: 'https://meet.tuturuuu.com/r/bs91fqmvp-d7213csa9-nd7sz39w',
  body: 'Private draft body',
  to: ['private@example.invalid'],
});
beforeEach(() => {
  localStorage.clear();
  let queue = Promise.resolve<unknown>(undefined);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, fn: () => unknown) => {
        const next = queue.then(fn);
        queue = next.catch(() => undefined);
        return next;
      },
    },
  });
});
it('serializes duplicate claims and persists only random IDs and expiration, surviving a reload', async () => {
  const payload = value();
  expect(
    await Promise.all([
      claimMeetMailHandoff(payload),
      claimMeetMailHandoff(payload),
    ])
  ).toEqual([true, false]);
  expect(await claimMeetMailHandoff(payload)).toBe(false);
  const stored = localStorage.getItem('mail-meet-handoff-receipts-v1') ?? '';
  expect(stored).toContain(payload.id);
  for (const privateValue of [
    payload.subject,
    payload.body,
    payload.to[0],
    payload.actorId,
    payload.workspaceId,
  ])
    expect(stored).not.toContain(privateValue);
});
it('refuses stale claims, full or corrupt receipts, and unavailable locking', async () => {
  const payload = value();
  expect(
    await claimMeetMailHandoff({ ...payload, issuedAt: Date.now() - 300_001 })
  ).toBe(false);
  localStorage.setItem('mail-meet-handoff-receipts-v1', 'bad');
  await expect(claimMeetMailHandoff(payload)).rejects.toThrow();
  localStorage.clear();
  for (let i = 0; i < 128; i++)
    expect(await claimMeetMailHandoff(value())).toBe(true);
  expect(await claimMeetMailHandoff(value())).toBe(false);
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: undefined,
  });
  await expect(claimMeetMailHandoff(payload)).rejects.toThrow(
    'Replay protection'
  );
});
