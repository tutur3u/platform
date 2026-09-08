import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getMailArchiveBehavior,
  nextMailThreadId,
  setMailArchiveBehavior,
} from './mail-reading-preferences';

afterEach(() => {
  vi.unstubAllGlobals();
  setMailArchiveBehavior('next');
});
describe('archive navigation', () => {
  const threads = ['a', 'b', 'c'].map((id) => ({ id }));
  it('opens the next visible conversation and falls back to the previous at the end', () => {
    expect(nextMailThreadId(threads, 'b', new Set(['b']))).toBe('c');
    expect(nextMailThreadId(threads, 'c', new Set(['c']))).toBe('b');
    expect(nextMailThreadId(threads, 'a', new Set(['a', 'b']))).toBe('c');
    expect(nextMailThreadId(threads, 'c', new Set(['a', 'b', 'c']))).toBeNull();
    expect(nextMailThreadId(threads, 'missing', new Set())).toBeNull();
  });
  it('defaults to next and persists the list preference', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key),
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    });
    expect(getMailArchiveBehavior()).toBe('next');
    setMailArchiveBehavior('list');
    expect(getMailArchiveBehavior()).toBe('list');
    expect(storage.get('tuturuuu-mail-after-archive')).toBe('list');
  });
});
