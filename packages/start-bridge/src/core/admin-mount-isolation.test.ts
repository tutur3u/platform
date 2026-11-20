import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  isolateMountedCookieHeader,
  scopeMountedResponseCookies,
} from './mount-isolation';

it('restricts Admin cookies to the app and strips the provider refresh token', () => {
  const config = readFileSync(
    new URL(
      '../../../../apps/infrastructure/start-bridge.config.ts',
      import.meta.url
    ),
    'utf8'
  );
  expect(config).toMatch(/isolation: \{ ownedCookies: \['NEXT_LOCALE'\] \}/u);
  const isolation = { ownedCookies: ['NEXT_LOCALE'] };

  const key = 'sb-project-auth-token';
  const value = encodeURIComponent(
    JSON.stringify({ access_token: 'access', refresh_token: 'refresh' })
  );
  const isolated = isolateMountedCookieHeader(
    `${key}=${value}; tuturuuu_app_session=app; tuturuuu_web_app_session=web; NEXT_LOCALE=vi`,
    isolation
  );
  const cookie = isolated?.split('; ').find((entry) => entry.startsWith(key));
  if (!cookie) throw new Error('Expected a provider access token');
  const session = Buffer.from(
    cookie.slice(`${key}=base64-`.length),
    'base64url'
  );
  expect(JSON.parse(session.toString('utf8'))).toEqual({
    access_token: 'access',
    refresh_token: '',
  });
  expect(isolated).not.toContain('tuturuuu_app_session');
  expect(isolated).not.toContain('tuturuuu_web_app_session');

  const response = new Response(null);
  response.headers.append('Set-Cookie', `${key}=; Max-Age=0; Path=/`);
  response.headers.append(
    'Set-Cookie',
    'tuturuuu_web_app_session=; Max-Age=0; Path=/'
  );
  response.headers.append(
    'Set-Cookie',
    'NEXT_LOCALE=vi; Domain=.tuturuuu.com; Path=/'
  );
  expect(
    scopeMountedResponseCookies(
      response,
      '/admin',
      isolation
    ).headers.getSetCookie()
  ).toEqual(['NEXT_LOCALE=vi; Path=/admin; Secure']);
});
