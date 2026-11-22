import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appRelativePathname, withAppBase } from './app-url';

// Every apex mount the gateway serves (`/contacts`, `/meet`, ...). A shared
// workspace switcher rewrites the first segment of `usePathname()` and pushes
// the result through `withAppBase`; the target must stay inside the mount.
const gatewayConfig = readFileSync(
  new URL('../../../../apps/gateway/wrangler.jsonc', import.meta.url),
  'utf8'
);
const mountedPaths =
  /"GATEWAY_MOUNTED_PATHS":\s*"([^"]+)"/u.exec(gatewayConfig)?.[1] ?? '';
const mounts = [
  ...new Set(
    mountedPaths
      .split(',')
      .map((path) => path.trim().replace(/\/\*$/u, ''))
      .filter((path) => /^\/[a-z][a-z0-9-]*$/u.test(path))
  ),
];

function switchTarget(pathname: string, nextSlug: string, base: string) {
  return withAppBase(pathname.replace(/^\/[^/]+/u, `/${nextSlug}`), base);
}

describe('workspace switch under every apex mount', () => {
  it('reads the mounted apps from the gateway', () => {
    expect(mounts).toContain('/contacts');
    expect(mounts.length).toBeGreaterThan(5);
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
