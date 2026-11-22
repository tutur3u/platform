import {
  ONE_ORIGIN_APP_ALIAS_BASE_PATHS,
  ONE_ORIGIN_APP_BASE_PATHS,
} from '@tuturuuu/utils/app-mounts';
import { describe, expect, it } from 'vitest';
import { appRelativePathname, withAppBase } from './app-url';

// Every app that can be mounted on the shared origin (`/contacts`, `/meet`,
// ...). A shared workspace switcher rewrites the first segment of
// `usePathname()` and pushes the result through `withAppBase`; the target
// must stay inside the mount.
const mounts = [
  ...new Set([
    ...Object.values(ONE_ORIGIN_APP_BASE_PATHS),
    ...Object.values(ONE_ORIGIN_APP_ALIAS_BASE_PATHS).flat(),
  ]),
].filter((path): path is string => typeof path === 'string');

function switchTarget(pathname: string, nextSlug: string, base: string) {
  return withAppBase(pathname.replace(/^\/[^/]+/u, `/${nextSlug}`), base);
}

describe('workspace switch under every shared-origin mount', () => {
  it('covers the mounted apps', () => {
    expect(mounts).toContain('/contacts');
    expect(mounts).toContain('/meet');
  });

  it.each(mounts)('%s keeps its mount and the equivalent page', (base) => {
    // Browser: Start's hydration leaves the router without the runtime base.
    const browser = appRelativePathname(`${base}/personal/users`, '', base);
    expect(switchTarget(browser, 'ws-next', base)).toBe(
      `${base}/ws-next/users`
    );
    // Server: the request router already applies the base.
    const server = appRelativePathname('/ws-prev/users', base, base);
    expect(switchTarget(server, 'personal', base)).toBe(
      `${base}/personal/users`
    );
  });
});
