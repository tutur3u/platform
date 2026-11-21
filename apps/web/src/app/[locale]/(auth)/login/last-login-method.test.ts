// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  arrangeLoginMethods,
  readLastLoginMethod,
  rememberLoginMethod,
} from './last-login-method';

afterEach(() => localStorage.clear());

describe('arrangeLoginMethods', () => {
  it('shows Google, email and passkey first and keeps the rest behind the disclosure', () => {
    expect(arrangeLoginMethods(null)).toEqual({
      more: ['apple', 'github', 'azure'],
      primary: ['google', 'email', 'passkey'],
    });
  });

  it('surfaces the last-used method first, including staff Microsoft', () => {
    expect(arrangeLoginMethods('azure')).toEqual({
      more: ['passkey', 'apple', 'github'],
      primary: ['azure', 'google', 'email'],
    });
    expect(arrangeLoginMethods('email').primary).toEqual([
      'email',
      'google',
      'passkey',
    ]);
    for (const method of ['google', 'apple', 'passkey', 'azure'] as const) {
      expect(arrangeLoginMethods(method).primary).toHaveLength(3);
    }
  });
});

describe('last login method storage', () => {
  it('remembers only known methods', () => {
    rememberLoginMethod('github');
    expect(readLastLoginMethod()).toBe('github');
    localStorage.setItem('tuturuuu:last-login-method', 'evil');
    expect(readLastLoginMethod()).toBeNull();
  });
});
