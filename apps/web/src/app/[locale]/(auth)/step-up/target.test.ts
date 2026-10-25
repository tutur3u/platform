import { afterEach, describe, expect, it, vi } from 'vitest';
import { passwordsHandoffTarget, passwordsStepUpTarget } from './target';

const state = 'a'.repeat(43);
const next = `https://passwords.tuturuuu.com/vi/workspace?state=${state}`;

describe('Passwords step-up target', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('refuses Portless destinations in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(passwordsStepUpTarget('passwords', `https://passwords.tuturuuu.localhost/en/workspace?state=${state}`)).toBeNull();
    expect(passwordsStepUpTarget('passwords', next)).toBe(next);
  });
  it.each([
    'https://passwords.tuturuuu.com',
    'https://passwords.tuturuuu.localhost',
  ])('accepts the exact registered origin %s', (origin) => {
    expect(
      passwordsStepUpTarget(
        'passwords',
        `${origin}/en/workspace?state=${state}`
      )
    ).toBe(`${origin}/en/workspace?state=${state}`);
  });
  it.each([
    `https://evil.test/en/workspace?state=${state}`,
    `http://passwords.tuturuuu.com/en/workspace?state=${state}`,
    `https://prefix.passwords.tuturuuu.localhost/en/workspace?state=${state}`,
    `https://passwords.tuturuuu.com:444/en/workspace?state=${state}`,
    `https://user@passwords.tuturuuu.com/en/workspace?state=${state}`,
    `https://passwords.tuturuuu.com//evil.test?state=${state}`,
    `https://passwords.tuturuuu.com/%2f%2fevil.test?state=${state}`,
    `https://passwords.tuturuuu.com/en/api/auth/logout?state=${state}`,
    `https://passwords.tuturuuu.com/verify-token?state=${state}`,
    `${next}&nextUrl=https://evil.test`,
    `${next}&token=secret`,
    `${next}&state=other`,
    `${next}#proof`,
    'https://passwords.tuturuuu.com/en/workspace',
  ])('rejects unsafe target %s', (url) => {
    expect(passwordsStepUpTarget('passwords', url)).toBeNull();
  });
  it('requires the Passwords app and scalar parameters', () => {
    expect(passwordsStepUpTarget('meet', next)).toBeNull();
    expect(passwordsStepUpTarget(['passwords'], next)).toBeNull();
    expect(passwordsStepUpTarget('passwords', [next])).toBeNull();
  });
  it('only follows the central handoff to the original destination and state', () => {
    const callback = new URL('/verify-token', next);
    callback.searchParams.set('targetApp', 'passwords');
    callback.searchParams.set('token', 'one-time-handoff');
    callback.searchParams.set('nextUrl', `/vi/workspace?state=${state}`);
    expect(passwordsHandoffTarget(callback.toString(), next)).toBe(
      callback.toString()
    );
    callback.searchParams.set('nextUrl', '/vi/workspace?state=another');
    expect(passwordsHandoffTarget(callback.toString(), next)).toBeNull();
    callback.hostname = 'evil.test';
    expect(passwordsHandoffTarget(callback.toString(), next)).toBeNull();
  });
});
