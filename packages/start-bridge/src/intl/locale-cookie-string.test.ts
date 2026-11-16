import { describe, expect, it } from 'vitest';
import { localeCookieString } from './navigation';

describe('localeCookieString', () => {
  it('keeps path=/ at a host root', () => {
    expect(localeCookieString('vi', '')).toBe(
      'NEXT_LOCALE=vi; path=/; max-age=31536000; samesite=lax'
    );
  });

  it('scopes the cookie to the mount so Web keeps its own locale', () => {
    expect(localeCookieString('vi', '/hive')).toBe(
      'NEXT_LOCALE=vi; path=/hive; max-age=31536000; samesite=lax; secure'
    );
  });
});
