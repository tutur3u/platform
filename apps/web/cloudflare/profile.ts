import { cloudflareAccessIssuer } from '@tuturuuu/utils/cloudflare-access';

export const stagingProfile = {
  host: 'web.staging.tutur3u.com',
  zone: 'tutur3u.com',
  cookieDomain: '.staging.tutur3u.com',
  supabaseUrl: 'https://fxefojytwimjiqxseqag.supabase.co',
  supabaseRef: 'fxefojytwimjiqxseqag',
  upstreamProjectHeader: 'x-tuturuuu-staging-supabase-ref',
  hsts: 'max-age=31536000',
} as const;

export interface WebCandidateEnv {
  WEB_START_CANDIDATE?: string;
  WEB_START_NATIVE_LEGAL?: string;
  WEB_START_NATIVE_SECURITY?: string;
  NEXT_FALLBACK_ORIGIN?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  AUTH_COOKIE_DOMAIN?: string;
  TRUSTED_PROXY_ORIGIN_SECRET?: string;
  /** Vercel Protection Bypass for Automation; sent only to the admitted origin. */
  VERCEL_AUTOMATION_BYPASS_SECRET?: string;
  /** Access team host and application AUD; the Worker verifies Access JWTs. */
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

/** Printable ASCII without spaces; bounds a secret before it becomes a header. */
export function headerSafeSecret(value: string | undefined, min = 32) {
  return (
    typeof value === 'string' &&
    value.length >= min &&
    value.length <= 256 &&
    /^[\x21-\x7e]+$/u.test(value)
  );
}

export function admittedOrigin(request: Request, env: WebCandidateEnv) {
  const url = new URL(request.url);
  if (
    env.WEB_START_CANDIDATE !== 'staging' ||
    url.origin !== `https://${stagingProfile.host}` ||
    env.NEXT_PUBLIC_SUPABASE_URL !== stagingProfile.supabaseUrl ||
    env.AUTH_COOKIE_DOMAIN !== stagingProfile.cookieDomain ||
    !env.TRUSTED_PROXY_ORIGIN_SECRET ||
    env.TRUSTED_PROXY_ORIGIN_SECRET.length < 32 ||
    !headerSafeSecret(env.VERCEL_AUTOMATION_BYPASS_SECRET) ||
    !cloudflareAccessIssuer(env.CF_ACCESS_TEAM_DOMAIN) ||
    !env.CF_ACCESS_AUD?.trim() ||
    !env.NEXT_FALLBACK_ORIGIN
  )
    return null;
  try {
    const upstream = new URL(env.NEXT_FALLBACK_ORIGIN);
    if (
      upstream.origin !== env.NEXT_FALLBACK_ORIGIN ||
      upstream.protocol !== 'https:' ||
      upstream.username ||
      upstream.password ||
      upstream.hostname === stagingProfile.host ||
      upstream.hostname === 'tuturuuu.com' ||
      upstream.hostname.endsWith('.tuturuuu.com') ||
      (!/^tuturuuu(?:-[a-z0-9-]+)?\.vercel\.app$/u.test(upstream.hostname) &&
        !upstream.hostname.endsWith('.staging.tutur3u.com'))
    )
      return null;
    return upstream.origin;
  } catch {
    return null;
  }
}
