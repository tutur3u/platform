import { describe, expect, it } from 'vitest';
import { localeCookieAssignment } from './locale-cookie';

describe('client locale cookie scope', () => {
  it('keeps the legacy default assignment byte for byte', () => {
    expect(localeCookieAssignment(undefined, 'vi')).toBe(
      'NEXT_LOCALE=vi; path=/; max-age=31536000; samesite=lax'
    );
    expect(localeCookieAssignment({}, 'en')).toBe(
      'NEXT_LOCALE=en; path=/; max-age=31536000; samesite=lax'
    );
  });
  it('scopes Mind to a host-only secure mount cookie', () => {
    const cookie = localeCookieAssignment(
      { name: 'mind_locale', path: '/mind', secure: true },
      'vi'
    );
    expect(cookie).toBe(
      'mind_locale=vi; path=/mind; max-age=31536000; samesite=lax; secure'
    );
    expect(cookie).not.toContain('Domain');
    expect(cookie).not.toContain('NEXT_LOCALE');
    expect(cookie).not.toContain('path=/;');
  });
  it.each([
    false,
    null,
    true,
    1,
    '',
    { name: 'bad;name' },
    { path: '//other' },
    { path: '/mind?x=1' },
    { path: '/mind; domain=other' },
    { secure: 'true' },
  ])('refuses disabled or invalid config %j', (config) => {
    expect(localeCookieAssignment(config, 'vi')).toBeNull();
  });
  it('does not interpolate cookie attributes through a locale', () => {
    expect(localeCookieAssignment(undefined, 'vi; domain=other')).toBeNull();
  });
});
