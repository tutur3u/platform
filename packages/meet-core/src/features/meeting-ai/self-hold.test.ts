// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  sessionStorage.clear();
  vi.resetModules();
});

it('holds synchronously and tells listeners before returning', async () => {
  const hold = await import('./self-hold');
  const seen: boolean[] = [];
  hold.onSelfCaptureFlags('a', () => seen.push(hold.isSelfCaptureHeld('a')));
  hold.holdSelfCapture('a');
  expect(seen).toEqual([true]);
  expect(hold.isSelfCaptureHeld('b')).toBe(false);
  hold.releaseSelfCapture('a');
  expect(seen).toEqual([true, false]);
});

it('never lets an Allow that started earlier release a later hold', async () => {
  const hold = await import('./self-hold');
  hold.holdSelfCapture('a');
  // An Allow starts now, then the person declines again before it returns.
  const allowStarted = hold.selfHoldEpoch('a');
  hold.holdSelfCapture('a');
  hold.releaseSelfCapture('a', allowStarted);
  expect(hold.isSelfCaptureHeld('a')).toBe(true);
  // An Allow that started after the last hold does release it.
  hold.releaseSelfCapture('a', hold.selfHoldEpoch('a'));
  expect(hold.isSelfCaptureHeld('a')).toBe(false);
});

it('keeps a hold across a reload of the tab until it is released', async () => {
  (await import('./self-hold')).holdSelfCapture('a');
  vi.resetModules();
  const reloaded = await import('./self-hold');
  expect(reloaded.isSelfCaptureHeld('a')).toBe(true);
  // Epochs keep increasing after a reload, so an old Allow cannot release.
  expect(reloaded.selfHoldEpoch('a')).toBeGreaterThan(0);
  reloaded.releaseSelfCapture('a');
  vi.resetModules();
  expect((await import('./self-hold')).isSelfCaptureHeld('a')).toBe(false);
});

it('still holds in memory when storage is unavailable', async () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const hold = await import('./self-hold');
  hold.holdSelfCapture('a');
  expect(hold.isSelfCaptureHeld('a')).toBe(true);
  spy.mockRestore();
});

it('tracks the notice to confirm and ineligibility apart from the hold', async () => {
  const hold = await import('./self-hold');
  const before = hold.selfCaptureFlags('a');
  hold.requireSelfNotice('a');
  expect(hold.selfCaptureFlags('a')).toEqual({
    held: false,
    noticeRequired: true,
    ineligible: false,
  });
  // Snapshots are stable until something changes.
  expect(hold.selfCaptureFlags('a')).toBe(hold.selfCaptureFlags('a'));
  expect(hold.selfCaptureFlags('a')).not.toBe(before);
  hold.confirmSelfNotice('a');
  hold.markSelfIneligible('a');
  expect(hold.selfCaptureFlags('a')).toMatchObject({
    noticeRequired: false,
    ineligible: true,
  });
  hold.resetSelfCaptureFlags('a');
  expect(hold.selfCaptureFlags('a')).toEqual({
    held: false,
    noticeRequired: false,
    ineligible: false,
  });
});
