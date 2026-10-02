// @vitest-environment node
import { getCookies, Headers, setCookie } from 'undici';
import { describe, expect, it } from 'vitest';

describe('Undici cookie compatibility', () => {
  it('preserves a cookie named __proto__ as an own data property', () => {
    const cookies = getCookies(
      new Headers({ cookie: '__proto__=literal-value; session=ordinary-value' })
    );

    expect(Object.hasOwn(cookies, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(cookies, '__proto__')?.value).toBe(
      'literal-value'
    );
    expect(cookies.session).toBe('ordinary-value');
    expect(Object.getPrototypeOf(cookies)).toBe(null);
  });

  it('retains an epoch expiry when serializing a clearing cookie', () => {
    const headers = new Headers();
    setCookie(headers, { name: 'session', value: '', expires: 0 });

    expect(headers.getSetCookie()).toEqual([
      'session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ]);
  });
});
