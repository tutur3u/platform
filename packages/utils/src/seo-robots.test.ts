import { describe, expect, it } from 'vitest';
import policy from './seo-policy.json';
import { PRIVATE_ROBOTS_HEADER, robotsForUrl } from './seo-robots';

const forms = policy.forms;
const robots = (url: string, options?: { noindex?: boolean }) =>
  robotsForUrl(forms, new URL(url), options);

describe('robots for a native Worker request', () => {
  it('indexes only the public allowlist on the canonical origin', () => {
    for (const path of ['/', '/en', '/vi/', '/f/abc', '/vi/f/abc'])
      expect(robots(`https://forms.tuturuuu.com${path}`), path).toBeNull();
  });

  it('keeps reserved and unlisted paths private', () => {
    for (const path of [
      '/api/v1/forms',
      '/login',
      '/vi/dashboard',
      '/en/embed/abc',
      '/f/abc/edit',
      '/settings',
    ])
      expect(robots(`https://forms.tuturuuu.com${path}`), path).toBe(
        PRIVATE_ROBOTS_HEADER
      );
  });

  it('keeps other hosts, staging and apps without a policy private', () => {
    for (const url of [
      'https://forms-staging.tuturuuu.com/',
      'https://tuturuuu.com/forms',
      'http://forms.tuturuuu.com/',
      'https://forms.tuturuuu.com.evil.test/',
    ])
      expect(robots(url), url).toBe(PRIVATE_ROBOTS_HEADER);
    expect(robots('https://forms.tuturuuu.com/', { noindex: true })).toBe(
      PRIVATE_ROBOTS_HEADER
    );
    expect(robotsForUrl(null, new URL('https://x.tuturuuu.com/'))).toBe(
      PRIVATE_ROBOTS_HEADER
    );
    // An app with an empty allowlist is private everywhere.
    expect(
      robotsForUrl(policy.finance, new URL('https://finance.tuturuuu.com/'))
    ).toBe(PRIVATE_ROBOTS_HEADER);
  });
});

describe('encoded paths decode once before every check', () => {
  const at = (app: 'git' | 'storefront', path: string) =>
    robotsForUrl(policy[app], new URL(`${policy[app].origin}${path}`));

  it('keeps encoded reserved names private, with or without a locale', () => {
    // `[^/]+/[^/]+` would index these once decoded, so the reserved check
    // must see the decoded name too.
    expect(at('git', '/auth/repo')).toBe(PRIVATE_ROBOTS_HEADER);
    for (const path of [
      '/%61uth/repo',
      '/%41UTH/repo'.toLowerCase(),
      '/vi/%61uth/repo',
      '/en/%61%75%74%68/repo',
      '/%64ashboard/x',
      '/%2D/x',
    ])
      expect(at('git', path), path).toBe(PRIVATE_ROBOTS_HEADER);
    for (const path of ['/%6cogin', '/vi/%6cogin', '/%63art', '/%63heckout'])
      expect(at('storefront', path), path).toBe(PRIVATE_ROBOTS_HEADER);
  });

  it('fails private on malformed or ambiguous encodings', () => {
    for (const path of [
      '/tutur3u%2Fplatform',
      '/tutur3u%2fplatform',
      '/tutur3u%5Cplatform',
      '/%zz/repo',
      '/tutur3u/%E0%A4%A',
      '/%2561uth/repo',
      '/tutur3u/plat%2566orm',
    ])
      expect(at('git', path), path).toBe(PRIVATE_ROBOTS_HEADER);
  });

  it('treats a harmless encoding exactly like its decoded path', () => {
    expect(at('git', '/tutur3u/plat%66orm')).toBe(
      at('git', '/tutur3u/platform')
    );
    expect(at('git', '/tutur3u/platform')).toBeNull();
    expect(at('storefront', '/my%2Dshop')).toBeNull();
  });
});
