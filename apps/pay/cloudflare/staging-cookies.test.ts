// @vitest-environment node

import { getTuturuuuSharedCookieOptions } from '@tuturuuu/utils/shared-cookie';
import { enforceStagingCookiePolicy } from '@tuturuuu/utils/staging-cookie-policy';
import { expect, it } from 'vitest';
import appConfig from '../start-bridge.config';
import { resolvePayNativeProfile } from './native-profile';
import { stagingCookieRequest, stagingCookieResponse } from './staging-cookies';

it('keeps every Pay staging root host outside the production cookie zone', () => {
  expect(resolvePayNativeProfile('staging').rootHost).toBe('pay.tutur3u.com');
  expect(appConfig.mounts.rootHosts).toEqual([]);
  for (const host of appConfig.mounts.rootHosts ?? [])
    expect(host === 'tuturuuu.com' || host.endsWith('.tuturuuu.com')).toBe(
      false
    );
});

it.each(['pay.tutur3u.com', 'pay.tuturuuu.com'])(
  'preserves cookie behavior for %s',
  (host) => {
    const staging = host === 'pay.tutur3u.com';
    const request = new Request(`https://${host}/`, {
      headers: { cookie: '__Host-session=host; session=domain' },
    });
    const input = stagingCookieRequest(request);
    expect(input.headers.get('cookie')).toBe(
      staging ? 'session=host' : '__Host-session=host; session=domain'
    );
    const cookie = 'session=fixture; Path=/other; HttpOnly; SameSite=Lax';
    const response = enforceStagingCookiePolicy(
      request,
      stagingCookieResponse(
        request,
        new Response('ok', { headers: { 'set-cookie': cookie } })
      )
    );
    expect(response.headers.getSetCookie()).toEqual([
      staging
        ? '__Host-session=fixture; Path=/; Secure; HttpOnly; SameSite=Lax'
        : cookie,
    ]);
    expect(getTuturuuuSharedCookieOptions({ path: '/' }, request).domain).toBe(
      staging ? undefined : '.tuturuuu.com'
    );
  }
);

it('selects production host and shared cookie domain only for production builds', () => {
  const staging = resolvePayNativeProfile('staging');
  const production = resolvePayNativeProfile('production');
  expect(staging.rootHost).toBe('pay.tutur3u.com');
  expect(staging.vars.NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN).toBe(
    '.staging.tutur3u.com'
  );
  expect(production.rootHost).toBe('pay.tuturuuu.com');
  expect(production.vars.NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN).toBe(
    '.tuturuuu.com'
  );
});

it.each(['pay.tutur3u.com', 'pay.tuturuuu.com'])(
  'rejects Domain only at the staging %s exit',
  async (host) => {
    const staging = host === 'pay.tutur3u.com';
    const request = new Request(`https://${host}/`);
    const cookie = 'session=fixture; Domain=.tuturuuu.com; Path=/; Secure';
    const response = enforceStagingCookiePolicy(
      request,
      stagingCookieResponse(
        request,
        new Response('ok', {
          headers: { 'set-cookie': cookie, location: '/private' },
        })
      )
    );
    expect(response.status).toBe(staging ? 500 : 200);
    expect(response.headers.getSetCookie()).toEqual(staging ? [] : [cookie]);
    if (staging) {
      expect(await response.text()).toBe('Staging cookie domain rejected');
      expect(response.headers.has('location')).toBe(false);
    }
  }
);
