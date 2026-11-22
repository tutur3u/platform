import { describe, expect, it } from 'vitest';
import { appRelativePathname } from './app-url';

// Start's client hydration resets the router to its build-time basepath, so
// a runtime-mounted app's browser router reports `/contacts/...` while its
// server router reports `/...`. Workspace switchers rewrite the first
// segment of `usePathname()`; a base-inclusive value sent `/contacts/x/users`
// to `/<ws>/x/users`, which the app proxy handed to Web as a 404.
describe('appRelativePathname', () => {
  it('strips the mount when the browser router does not apply it', () => {
    expect(
      appRelativePathname('/contacts/personal/users', '', '/contacts')
    ).toBe('/personal/users');
    expect(
      appRelativePathname('/contacts/personal/users', '/', '/contacts')
    ).toBe('/personal/users');
    expect(appRelativePathname('/contacts', '', '/contacts')).toBe('/');
    expect(appRelativePathname('/contacts/', '', '/contacts')).toBe('/');
  });

  it('never strips twice when the router already applies the mount', () => {
    expect(
      appRelativePathname('/contacts/users', '/contacts', '/contacts')
    ).toBe('/contacts/users');
    expect(
      appRelativePathname('/personal/users', '/contacts/', '/contacts')
    ).toBe('/personal/users');
  });

  it('is the identity at the root and outside the mount boundary', () => {
    expect(appRelativePathname('/ws/users', '', '')).toBe('/ws/users');
    expect(appRelativePathname('/contactsx/users', '', '/contacts')).toBe(
      '/contactsx/users'
    );
    expect(appRelativePathname('/mail/inbox', '/', '/mail')).toBe('/inbox');
  });
});
