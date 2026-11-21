import { describe, expect, it, vi } from 'vitest';
import {
  replyStepUpHref,
  savePendingReply,
  takePendingReply,
} from './thread-reply-pending';

const TARGET = { machineId: 'skr-m4', threadId: 'thread:a' };
const KEY = '00000000-0000-4000-8000-000000000001';
const NOW = 1_795_000_000_000;
const OWNER = 'owner@example.invalid';

function memory() {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: (name: string) => values.get(name) ?? null,
      removeItem: (name: string) => void values.delete(name),
      setItem: (name: string, value: string) => void values.set(name, value),
    },
  };
}

describe('a reply kept across the second-factor sign-in', () => {
  it('goes to the sign-in that asks for the factor anew, and back to the page', () => {
    const href = replyStepUpHref('/vi/projects?thread=a&x=1');
    expect(href.startsWith('/login?')).toBe(true);
    const query = new URLSearchParams(href.slice('/login?'.length));
    expect(Object.fromEntries(query)).toEqual({
      mfa: 'fresh',
      nextUrl: '/vi/projects?thread=a&x=1',
    });
  });

  it('is handed back once, to the thread it was written for', () => {
    const { storage, values } = memory();
    const options = { now: () => NOW, storage };
    expect(
      savePendingReply(OWNER, TARGET, { key: KEY, text: 'Ship it.' }, options)
    ).toBe(true);
    // Another thread, and the same thread on another machine, get nothing
    // and leave it in place.
    for (const other of [
      { ...TARGET, threadId: 'thread:b' },
      { ...TARGET, machineId: 'other' },
      { ...TARGET, environmentId: 'env-2' },
    ])
      expect(takePendingReply(OWNER, other, options)).toBeNull();
    expect(values.size).toBe(1);
    expect(takePendingReply(OWNER, TARGET, options)).toEqual({
      key: KEY,
      text: 'Ship it.',
    });
    // Handed back once.
    expect(takePendingReply(OWNER, TARGET, options)).toBeNull();
    expect(values.size).toBe(0);
  });

  it('is never resumed under another account', () => {
    // What comes back is sent as the signed-in owner's reply, so a reply
    // written before a sign-in as someone else must not come back at all.
    const { storage, values } = memory();
    const options = { now: () => NOW, storage };
    savePendingReply(OWNER, TARGET, { key: KEY, text: 'Ship it.' }, options);
    expect(
      takePendingReply('other@example.invalid', TARGET, options)
    ).toBeNull();
    expect(values.size).toBe(0);
    expect(takePendingReply(OWNER, TARGET, options)).toBeNull();

    // An entry without an owner, or kept without one, is not usable either.
    values.set(
      'mastermind.reply.pending.v1',
      JSON.stringify({ ...TARGET, key: KEY, text: 'Go', savedAt: NOW })
    );
    expect(takePendingReply(OWNER, TARGET, options)).toBeNull();
    expect(
      savePendingReply('', TARGET, { key: KEY, text: 'Go' }, options)
    ).toBe(false);
    expect(values.size).toBe(0);
  });

  it('keeps the environment as part of the thread it belongs to', () => {
    const { storage } = memory();
    const linked = { ...TARGET, environmentId: 'env-2' };
    savePendingReply(
      OWNER,
      linked,
      { key: KEY, text: 'Go' },
      { now: () => NOW, storage }
    );
    expect(
      takePendingReply(OWNER, TARGET, { now: () => NOW, storage })
    ).toBeNull();
    expect(
      takePendingReply(OWNER, linked, { now: () => NOW, storage })?.text
    ).toBe('Go');
  });

  it('drops a reply that is older than fifteen minutes or not in shape', () => {
    const { storage, values } = memory();
    savePendingReply(
      OWNER,
      TARGET,
      { key: KEY, text: 'Go' },
      { now: () => NOW, storage }
    );
    expect(
      takePendingReply(OWNER, TARGET, {
        now: () => NOW + 15 * 60_000 + 1,
        storage,
      })
    ).toBeNull();
    expect(values.size).toBe(0);

    for (const raw of [
      'not json',
      '[]',
      JSON.stringify({
        owner: OWNER,
        ...TARGET,
        key: 'not-a-key',
        text: 'Go',
        savedAt: NOW,
      }),
      JSON.stringify({
        owner: OWNER,
        ...TARGET,
        key: KEY,
        text: '   ',
        savedAt: NOW,
      }),
      JSON.stringify({
        ...TARGET,
        key: KEY,
        text: 'x'.repeat(4001),
        savedAt: NOW,
      }),
      JSON.stringify({
        ...TARGET,
        key: KEY,
        text: 'Go',
        savedAt: NOW + 60_000,
      }),
      JSON.stringify({ owner: OWNER, ...TARGET, key: KEY, text: 'Go' }),
    ]) {
      values.set('mastermind.reply.pending.v1', raw);
      expect(
        takePendingReply(OWNER, TARGET, { now: () => NOW, storage })
      ).toBeNull();
      expect(values.size).toBe(0);
    }
  });

  it('refuses to keep what it would not hand back, and survives storage that fails', () => {
    const { storage, values } = memory();
    const options = { now: () => NOW, storage };
    for (const reply of [
      { key: 'not-a-key', text: 'Go' },
      { key: KEY, text: '  ' },
      { key: KEY, text: 'x'.repeat(4001) },
    ])
      expect(savePendingReply(OWNER, TARGET, reply, options)).toBe(false);
    expect(values.size).toBe(0);

    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(
      savePendingReply(
        OWNER,
        TARGET,
        { key: KEY, text: 'Go' },
        { storage: broken }
      )
    ).toBe(false);
    expect(takePendingReply(OWNER, TARGET, { storage: broken })).toBeNull();
    // No session storage at all, as on the server.
    vi.stubGlobal('sessionStorage', undefined);
    try {
      expect(savePendingReply(OWNER, TARGET, { key: KEY, text: 'Go' })).toBe(
        false
      );
      expect(takePendingReply(OWNER, TARGET)).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
