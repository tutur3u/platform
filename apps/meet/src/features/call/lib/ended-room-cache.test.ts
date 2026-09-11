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
  const unsubscribe = subscribeEndedRooms('account-a', notify);
  rememberEndedRoom('account-a', 'meeting-1');
  rememberEndedRoom('account-a', 'meeting-1');
  expect(notify).toHaveBeenCalledOnce();
  unsubscribe();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(() => rememberEndedRoom('account-a', 'meeting-2')).not.toThrow();
});

it('ignores unrelated account and storage changes', () => {
  const notify = vi.fn();
  const unsubscribe = subscribeEndedRooms('account-a', notify);
  rememberEndedRoom('account-b', 'meeting-1');
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: 'unrelated',
      newValue: '1',
      storageArea: localStorage,
    })
  );
  expect(notify).not.toHaveBeenCalled();
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: 'meet-ended-v1:account-a',
      newValue: '{}',
      storageArea: localStorage,
    })
  );
  expect(notify).toHaveBeenCalledOnce();
  unsubscribe();
});

it('ignores storage events when the storage getter is blocked', () => {
  const notify = vi.fn();
  const unsubscribe = subscribeEndedRooms('account-a', notify);
  const error = vi.fn((event: ErrorEvent) => event.preventDefault());
  window.addEventListener('error', error);
  const getter = vi
    .spyOn(window, 'localStorage', 'get')
    .mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
  try {
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(error).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  } finally {
    getter.mockRestore();
    unsubscribe();
    window.removeEventListener('error', error);
  }
});
