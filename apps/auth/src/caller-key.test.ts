import { describe, expect, it } from 'vite-plus/test';
import { keyOf } from './__tests__/sqlite';
import { checkCallerKey, parseCallerKeySecret } from './caller-key';

describe('caller keys', () => {
  it('accepts the current key from a bare secret', () => {
    const secret = parseCallerKeySecret(keyOf(1));
    expect(checkCallerKey(secret, keyOf(1))).toEqual({
      ok: true,
      slot: 'current',
    });
    expect(checkCallerKey(secret, keyOf(2))).toEqual({ ok: false });
  });

  it('accepts current and previous during a rotation', () => {
    const secret = parseCallerKeySecret(
      JSON.stringify({ current: keyOf(2), previous: keyOf(1) })
    );
    expect(checkCallerKey(secret, keyOf(2))).toEqual({
      ok: true,
      slot: 'current',
    });
    expect(checkCallerKey(secret, keyOf(1))).toEqual({
      ok: true,
      slot: 'previous',
    });
    expect(checkCallerKey(secret, keyOf(3))).toEqual({ ok: false });
  });

  it('refuses a dropped previous key', () => {
    const secret = parseCallerKeySecret(JSON.stringify({ current: keyOf(2) }));
    expect(checkCallerKey(secret, keyOf(1))).toEqual({ ok: false });
  });

  it('never matches the all-zero key when there is no previous slot', () => {
    const secret = parseCallerKeySecret(keyOf(5));
    expect(checkCallerKey(secret, keyOf(0))).toEqual({ ok: false });
  });

  it('refuses every call when the auth-side secret is absent or malformed', () => {
    for (const raw of [
      undefined,
      null,
      '',
      'short',
      `${keyOf(1)}=`,
      `${keyOf(1)},${keyOf(2)}`,
      JSON.stringify({ current: keyOf(1), extra: keyOf(2) }),
      JSON.stringify({ current: keyOf(1), previous: 'bad' }),
      JSON.stringify({ previous: keyOf(1) }),
      JSON.stringify([keyOf(1)]),
      '{not json',
    ]) {
      const secret = parseCallerKeySecret(raw);
      expect(secret).toBeNull();
      expect(checkCallerKey(secret, keyOf(1))).toEqual({ ok: false });
    }
  });

  it('refuses malformed and non-canonical presented keys', () => {
    const secret = parseCallerKeySecret(keyOf(1));
    const canonical = keyOf(1);
    // The 43rd character carries two unused bits; flipping them keeps the
    // bytes but is not the canonical encoding.
    const last = canonical.at(-1) ?? 'A';
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const alias = canonical.slice(0, -1) + alphabet[alphabet.indexOf(last) + 1];
    for (const presented of [
      undefined,
      null,
      42,
      {},
      '',
      canonical.slice(1),
      alias,
    ]) {
      expect(checkCallerKey(secret, presented)).toEqual({ ok: false });
    }
  });
});
