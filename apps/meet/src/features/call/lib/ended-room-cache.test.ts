// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  isKnownEndedRoom,
  rememberEndedRoom,
  subscribeEndedRooms,
} from './ended-room-cache';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it('keeps terminal hints separate between accounts and stores no permissions', () => {
  rememberEndedRoom('account-a', 'meeting-1');
  expect(isKnownEndedRoom('account-a', 'meeting-1')).toBe(true);
  expect(isKnownEndedRoom('account-b', 'meeting-1')).toBe(false);
  expect(
    Object.keys(JSON.parse(localStorage.getItem('meet-ended-v1:account-a')!))
  ).toEqual(['meeting-1']);
});
it('expires old hints and ignores malformed storage', () => {
  localStorage.setItem(
    'meet-ended-v1:account-a',
    JSON.stringify({ 'meeting-1': Date.now() - 31 * 86400000 })
  );
  expect(isKnownEndedRoom('account-a', 'meeting-1')).toBe(false);
  localStorage.setItem('meet-ended-v1:account-a', '{bad');
  expect(isKnownEndedRoom('account-a', 'meeting-1')).toBe(false);
});
it('notifies mounted meeting cards once and tolerates unavailable storage', () => {
  const notify = vi.fn();
  const unsubscribe = subscribeEndedRooms(notify);
  rememberEndedRoom('account-a', 'meeting-1');
  rememberEndedRoom('account-a', 'meeting-1');
  expect(notify).toHaveBeenCalledOnce();
  unsubscribe();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(() => rememberEndedRoom('account-a', 'meeting-2')).not.toThrow();
});
