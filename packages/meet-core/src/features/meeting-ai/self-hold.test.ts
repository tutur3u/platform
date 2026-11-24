// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  sessionStorage.clear();
  vi.resetModules();
});

it('holds synchronously and tells listeners before returning', async () => {
  const hold = await import('./self-hold');
  const seen: boolean[] = [];
  hold.onSelfCaptureHold('a', () => seen.push(hold.isSelfCaptureHeld('a')));
  hold.holdSelfCapture('a');
  expect(seen).toEqual([true]);
  expect(hold.isSelfCaptureHeld('b')).toBe(false);
  hold.releaseSelfCapture('a');
  expect(seen).toEqual([true, false]);
});

it('keeps a hold across a reload of the tab until it is released', async () => {
  (await import('./self-hold')).holdSelfCapture('a');
  vi.resetModules();
  const reloaded = await import('./self-hold');
  expect(reloaded.isSelfCaptureHeld('a')).toBe(true);
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
