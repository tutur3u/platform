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
