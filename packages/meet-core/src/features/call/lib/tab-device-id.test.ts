import { describe, expect, it } from 'vitest';
import {
  acquireTabDeviceId,
  CLAIM_TTL_MS,
  releaseTabDeviceClaim,
  renewTabDeviceClaim,
  type TabDeviceEnvironment,
  tabDeviceKey,
} from './tab-device-id';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  copy() {
    const next = new MemoryStorage();
    next.values = new Map(this.values);
    return next;
  }
}

const throwing = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
};

function browser() {
  let clock = 1_000_000;
  let counter = 0;
  const local = new MemoryStorage();
  const tab = (session = new MemoryStorage()): TabDeviceEnvironment & {
    session: MemoryStorage;
  } => ({
    session,
    local,
    now: () => clock,
    randomId: () => `id-${++counter}`,
  });
  return {
    local,
    tab,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const key = tabDeviceKey('meeting-1', 'account-1');

describe('tab device id', () => {
  it('resumes the same id when the tab reloads', () => {
    const { tab } = browser();
    const first = tab();
    const page = acquireTabDeviceId(key, first);
    // Unloading drops the claim; the reload keeps sessionStorage.
    releaseTabDeviceClaim(page, first);
    const reloaded = acquireTabDeviceId(key, first);
    expect(reloaded.deviceId).toBe(page.deviceId);
    expect(reloaded.nonce).not.toBe(page.nonce);
  });

  it('resumes the id after an unload that left its claim expired', () => {
    const { tab, advance } = browser();
    const first = tab();
    const page = acquireTabDeviceId(key, first);
    advance(CLAIM_TTL_MS);
    expect(acquireTabDeviceId(key, first).deviceId).toBe(page.deviceId);
  });

  it('gives a new tab its own id', () => {
    const { tab } = browser();
    const page = acquireTabDeviceId(key, tab());
    expect(acquireTabDeviceId(key, tab()).deviceId).not.toBe(page.deviceId);
  });

  it('gives a duplicated tab a new id while the original stays live', () => {
    const { tab } = browser();
    const original = tab();
    const page = acquireTabDeviceId(key, original);
    // Duplicating a tab copies its sessionStorage.
    const duplicate = tab(original.session.copy());
    const copy = acquireTabDeviceId(key, duplicate);
    expect(copy.deviceId).not.toBe(page.deviceId);
    expect(duplicate.session.getItem(key)).toBe(copy.deviceId);
    expect(original.session.getItem(key)).toBe(page.deviceId);
    // The original's renewal does not take the duplicate's claim, and the
    // duplicate's reload keeps its own id.
    renewTabDeviceClaim(page, original);
    releaseTabDeviceClaim(copy, duplicate);
    expect(acquireTabDeviceId(key, duplicate).deviceId).toBe(copy.deviceId);
  });

  it('keeps a renewed claim live past the first expiry', () => {
    const { tab, advance } = browser();
    const original = tab();
    const page = acquireTabDeviceId(key, original);
    advance(CLAIM_TTL_MS - 1);
    renewTabDeviceClaim(page, original);
    advance(CLAIM_TTL_MS - 1);
    const duplicate = tab(original.session.copy());
    expect(acquireTabDeviceId(key, duplicate).deviceId).not.toBe(
      page.deviceId
    );
  });

  it('only drops its own claim', () => {
    const { tab, local } = browser();
    const first = tab();
    const page = acquireTabDeviceId(key, first);
    releaseTabDeviceClaim({ ...page, nonce: 'other-page' }, first);
    expect(local.getItem(`meet:device-claim:${page.deviceId}`)).not.toBeNull();
  });

  it('falls back to a fresh id when storage throws or is missing', () => {
    let counter = 0;
    const randomId = () => `fresh-${++counter}`;
    const denied = { session: throwing, local: throwing, randomId };
    const page = acquireTabDeviceId(key, denied);
    expect(page.deviceId).toMatch(/^fresh-/);
    expect(() => renewTabDeviceClaim(page, denied)).not.toThrow();
    expect(() => releaseTabDeviceClaim(page, denied)).not.toThrow();
    const missing = { session: null, local: null, randomId };
    expect(acquireTabDeviceId(key, missing).deviceId).not.toBe(page.deviceId);
  });

  it('ignores a malformed claim', () => {
    const { tab, local } = browser();
    const first = tab();
    first.session.setItem(key, 'stored-id');
    local.setItem('meet:device-claim:stored-id', '{not json');
    expect(acquireTabDeviceId(key, first).deviceId).toBe('stored-id');
  });

  it('scopes ids per meeting and account', () => {
    expect(tabDeviceKey('meeting-1', 'account-1')).toBe(
      'meet:device:meeting-1:account-1'
    );
    expect(tabDeviceKey('meeting-1', null)).toBe('meet:device:meeting-1:guest');
    const { tab } = browser();
    const session = tab();
    const a = acquireTabDeviceId(key, session);
    const otherMeeting = acquireTabDeviceId(
      tabDeviceKey('meeting-2', 'account-1'),
      session
    );
    const otherAccount = acquireTabDeviceId(
      tabDeviceKey('meeting-1', 'account-2'),
      session
    );
    expect(new Set([a, otherMeeting, otherAccount].map((c) => c.deviceId)))
      .toHaveProperty('size', 3);
    expect(session.session.getItem(key)).toBe(a.deviceId);
  });
});
