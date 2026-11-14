import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '../../..');

/**
 * Every app proxy that runs next-intl's middleware (which writes `NEXT_LOCALE`
 * from the request) exports a proxy wrapped by the locale cookie scope helper,
 * so the cookie's `Domain` and `Secure` come from the canonical origin.
 */
const intlProxies = readdirSync(join(repoRoot, 'apps'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => `apps/${entry.name}/src/proxy.ts`)
  .filter((file) => existsSync(join(repoRoot, file)))
  .filter((file) =>
    readFileSync(join(repoRoot, file), 'utf8').includes(
      "from 'next-intl/middleware'"
    )
  );

describe('locale cookie scope adoption', () => {
  it('finds the satellite proxies that run next-intl', () => {
    expect(intlProxies.length).toBeGreaterThan(20);
  });

  it.each(intlProxies)('%s exports a locale-cookie-scoped proxy', (file) => {
    const source = readFileSync(join(repoRoot, file), 'utf8');

    expect(source).toMatch(
      /(?:export const proxy|const proxy) = with(?:Canonical|Secure)LocaleCookie\(/u
    );
    expect(source).not.toMatch(/export (?:default )?async function proxy\b/u);
    expect(source).not.toMatch(
      /getTuturuuuSharedCookieOptions\(\s*LOCALE_COOKIE_OPTIONS,\s*request\s*\)/u
    );
  });
});
