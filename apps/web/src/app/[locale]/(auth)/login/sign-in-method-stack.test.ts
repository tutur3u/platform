import { describe, expect, it } from 'vitest';
import { LOGIN_METHODS, type LoginMethod } from './last-login-method';
import {
  ALTERNATIVE_SLOT_COUNT,
  arrangeSignInMethodStack,
} from './sign-in-method-stack';

describe('arrangeSignInMethodStack', () => {
  it('shows Google then passkey under email, the rest behind More', () => {
    expect(arrangeSignInMethodStack(null)).toEqual({
      alternatives: ['google', 'passkey'],
      emailLastUsed: false,
      more: ['apple', 'github', 'azure'],
    });
  });

  it.each([
    ['google', ['google', 'passkey'], ['apple', 'github', 'azure']],
    ['passkey', ['passkey', 'google'], ['apple', 'github', 'azure']],
    ['apple', ['apple', 'google'], ['passkey', 'github', 'azure']],
    ['github', ['github', 'google'], ['passkey', 'apple', 'azure']],
    ['azure', ['azure', 'google'], ['passkey', 'apple', 'github']],
  ] as const)(
    'puts a last-used %s first without changing the slot count',
    (lastUsed, alternatives, more) => {
      expect(arrangeSignInMethodStack(lastUsed)).toEqual({
        alternatives,
        emailLastUsed: false,
        more,
      });
    }
  );

  it('keeps the default order and marks the field when email was last', () => {
    expect(arrangeSignInMethodStack('email')).toEqual({
      alternatives: ['google', 'passkey'],
      emailLastUsed: true,
      more: ['apple', 'github', 'azure'],
    });
  });

  it.each([null, ...LOGIN_METHODS] as (LoginMethod | null)[])(
    'offers every non-email method exactly once for %s',
    (lastUsed) => {
      const { alternatives, more } = arrangeSignInMethodStack(lastUsed);
      expect(alternatives).toHaveLength(ALTERNATIVE_SLOT_COUNT);
      expect([...alternatives, ...more].sort()).toEqual(
        LOGIN_METHODS.filter((method) => method !== 'email').sort()
      );
    }
  );
});
