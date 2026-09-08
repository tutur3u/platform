import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMailLocalPreference } from './mail-local-preference';

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const storage = new Map<string, string>();
  const events = new Map<string, (...args: any[]) => void>();
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
  };
  vi.stubGlobal('window', {
    localStorage,
    addEventListener: (name: string, listener: (...args: any[]) => void) =>
      events.set(name, listener),
    removeEventListener: (name: string, listener: (...args: any[]) => void) => {
      if (events.get(name) === listener) events.delete(name);
    },
  });
  return {
    storage,
    events,
    localStorage,
    preference: createMailLocalPreference('key', 'next', ['next', 'list']),
  };
}
describe('browser preference lifecycle', () => {
  it('keeps reads pure and retries failed persistence when focus returns', () => {
    const { preference, localStorage, storage, events } = fixture();
    const unsubscribe = preference.subscribe(vi.fn());
    localStorage.setItem.mockImplementationOnce(() => {
      throw new Error('quota');
    });
    preference.set('list');
    expect(preference.getSnapshot()).toBe('list');
    expect(preference.getSnapshot()).toBe('list');
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
    events.get('focus')!();
    expect(storage.get('key')).toBe('list');
    expect(localStorage.setItem).toHaveBeenCalledTimes(2);
    unsubscribe();
    expect(events.size).toBe(0);
  });
  it('applies cross-tab clears and removes the shared listener after the last subscriber', () => {
    const { preference, storage, events, localStorage } = fixture();
    const first = preference.subscribe(vi.fn());
    const second = preference.subscribe(vi.fn());
    preference.set('list');
    storage.clear();
    events.get('storage')!({
      key: null,
      newValue: null,
      storageArea: localStorage,
    });
    expect(preference.getSnapshot()).toBe('next');
    first();
    expect(events.has('storage')).toBe(true);
    second();
    expect(events.size).toBe(0);
  });
});
