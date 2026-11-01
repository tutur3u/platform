import { enforceStagingCookiePolicy } from '@tuturuuu/utils/staging-cookie-policy';
import { isStagingAppHostname } from '@tuturuuu/utils/staging-hosts';

export const DRIVE_STAGING_ORIGIN = 'https://drive.tutur3u.com';
export const STAGING_WEB_ORIGIN = 'https://web.tutur3u.com';
// Same project pinned by .github/workflows/supabase-staging.yaml.
export const STAGING_SUPABASE_ORIGIN =
  'https://fxefojytwimjiqxseqag.supabase.co';

export const stagingVars = {
  TUTURUUU_NOINDEX: '1',
  NEXT_PUBLIC_APP_URL: DRIVE_STAGING_ORIGIN,
  NEXT_PUBLIC_DRIVE_APP_URL: DRIVE_STAGING_ORIGIN,
  DRIVE_APP_URL: DRIVE_STAGING_ORIGIN,
  NEXT_PUBLIC_WEB_APP_URL: STAGING_WEB_ORIGIN,
  WEB_APP_URL: STAGING_WEB_ORIGIN,
  TTR_URL: STAGING_WEB_ORIGIN,
  INTERNAL_WEB_API_ORIGIN: STAGING_WEB_ORIGIN,
  NEXT_PUBLIC_SUPABASE_URL: STAGING_SUPABASE_ORIGIN,
  SUPABASE_SERVER_URL: STAGING_SUPABASE_ORIGIN,
  SUPABASE_URL: STAGING_SUPABASE_ORIGIN,
};

export function isDriveStagingEnvironment(
  env: Partial<Record<keyof typeof stagingVars, string>>
) {
  const configured = new Map(Object.entries(env));
  return Object.entries(stagingVars).every(
    ([name, value]) => configured.get(name) === value
  );
}

export function scopeStagingCookies(
  request: Request,
  response: Response
): Response {
  if (!isStagingAppHostname(new URL(request.url).hostname)) return response;
  const checked = enforceStagingCookiePolicy(request, response);
  const scoped = new Response(checked.body, checked);
  scoped.headers.set('Strict-Transport-Security', 'max-age=63072000');
  const cookies = scoped.headers.getSetCookie();
  scoped.headers.delete('Set-Cookie');
  for (const cookie of cookies) {
    scoped.headers.append(
      'Set-Cookie',
      /;\s*secure\s*(?:;|$)/iu.test(cookie) ? cookie : `${cookie}; Secure`
    );
  }
  return scoped;
}
