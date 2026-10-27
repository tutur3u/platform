export const DRIVE_STAGING_ORIGIN = 'https://drive.staging.tutur3u.com';
export const STAGING_WEB_ORIGIN = 'https://staging.tutur3u.com';
// Same project pinned by .github/workflows/supabase-staging.yaml.
export const STAGING_SUPABASE_ORIGIN =
  'https://fxefojytwimjiqxseqag.supabase.co';
export const STAGING_COOKIE_DOMAIN = '.staging.tutur3u.com';

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
  TUTURUUU_COOKIE_DOMAIN: STAGING_COOKIE_DOMAIN,
};

export function isDriveStagingEnvironment(
  env: Partial<Record<keyof typeof stagingVars, string>>
) {
  const configured = new Map(Object.entries(env));
  return Object.entries(stagingVars).every(
    ([name, value]) => configured.get(name) === value
  );
}

export function scopeStagingCookies(response: Response): Response {
  const scoped = new Response(response.body, response);
  scoped.headers.set('Strict-Transport-Security', 'max-age=63072000');
  const cookies = scoped.headers.getSetCookie();
  scoped.headers.delete('Set-Cookie');
  for (const cookie of cookies) {
    const attributes = cookie
      .split(';')
      .filter(
        (part, index) =>
          index === 0 || !/^\s*(?:domain|secure)(?:=|\s*$)/iu.test(part)
      );
    scoped.headers.append(
      'Set-Cookie',
      `${attributes.join(';')}; Domain=${STAGING_COOKIE_DOMAIN}; Secure`
    );
  }
  return scoped;
}
