import { describe, expect, it } from 'vitest';
import { enforceStagingCookiePolicy } from './staging-cookie-policy';
import { STAGING_APP_LABELS } from './staging-hosts';

describe('staging outgoing cookie fence', () => {
  it.each(STAGING_APP_LABELS)('rejects every Domain attribute on %s', (app) => {
    for (const attribute of [
      'Domain=.tutur3u.com',
      'Domain=.staging.tutur3u.com',
      `Domain=${app}.tutur3u.com`,
      'dOmAiN = ',
      'DOMAIN=.tuturuuu.com',
    ]) {
      const response = enforceStagingCookiePolicy(
        new Request(`https://${app}.tutur3u.com/`),
        new Response(null, {
          headers: {
            'set-cookie': `a=b; Path=/; ${attribute}; Secure`,
            'strict-transport-security': 'max-age=31536000',
          },
        })
      );
      expect(response.status, attribute).toBe(500);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(response.headers.get('strict-transport-security')).toBe(
        'max-age=31536000'
      );
    }
  });
  it('preserves host-only cookies including values that mention Domain', () => {
    const response = new Response(null, {
      headers: { 'set-cookie': 'a=Domain=value; Secure; Path=/' },
    });
    expect(
      enforceStagingCookiePolicy(
        new Request('https://web.tutur3u.com/'),
        response
      )
    ).toBe(response);
  });
  it.each([
    'tuturuuu.com',
    'tasks.tuturuuu.com',
    'tutur3u.com',
    'www.tutur3u.com',
    'ingest.tutur3u.com',
    'mastermind-hub.tutur3u.com',
    'iris-relay.tutur3u.com',
  ])('preserves production response bytes on %s', (host) => {
    const response = new Response(null, {
      headers: { 'set-cookie': 'a=b; Domain=.tuturuuu.com; Path=/; Secure' },
    });
    expect(
      enforceStagingCookiePolicy(new Request(`https://${host}/`), response)
    ).toBe(response);
    expect(response.headers.getSetCookie()).toEqual([
      'a=b; Domain=.tuturuuu.com; Path=/; Secure',
    ]);
  });
});
