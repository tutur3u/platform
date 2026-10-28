import { productionSupabaseProjectRefs } from '../../../scripts/wave1-staging/profiles.ts';

export const apps = ['meet', 'calendar', 'mail', 'apps', 'web'] as const;
export type Wave1App = (typeof apps)[number];
export type Locale = 'en' | 'vi';
type Env = Record<string, string | undefined>;

export function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Required staging input: ${name}`);
  return value;
}

export function stagingOrigin(
  value: string,
  role: Wave1App | 'issuer'
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Staging origin must be an absolute HTTPS origin');
  }
  const host = url.hostname;
  const named =
    role === 'issuer' ? 'staging.tutur3u.com' : `${role}.staging.tutur3u.com`;
  if (
    url.protocol !== 'https:' ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    host !== named
  ) {
    throw new Error(
      'Refusing a production, canonical or unreviewed staging origin'
    );
  }
  return url.origin;
}

export function relativePath(value: string): string {
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\#\r\n]/u.test(value) ||
    new URL(value, 'https://staging.invalid').origin !==
      'https://staging.invalid'
  ) {
    throw new Error('Expected a same-origin staging path');
  }
  return value;
}

export function localized(path: string, locale: Locale): string {
  return `${locale === 'vi' ? '/vi' : '/en'}${relativePath(path)}`;
}

export function readConfig(env: Env) {
  const app = apps.find((candidate) => candidate === env.WAVE1_STAGING_APP);
  if (!app)
    throw new Error(
      'WAVE1_STAGING_APP must be meet, calendar, mail, apps or web'
    );
  if (env.WAVE1_STAGING_DISPOSABLE_ACCOUNT !== 'confirmed') {
    throw new Error(
      'Owner must confirm disposable staging account and resources'
    );
  }
  const sha = required(env, 'WAVE1_STAGING_SOURCE_SHA');
  if (!/^[a-f0-9]{40}$/u.test(sha))
    throw new Error('Require full staging source SHA');
  const supabaseRef = required(env, 'WAVE1_STAGING_SUPABASE_PROJECT_REF');
  const productionRef = required(env, 'WAVE1_PRODUCTION_SUPABASE_PROJECT_REF');
  if (
    !/^[a-z0-9]{20}$/u.test(supabaseRef) ||
    !/^[a-z0-9]{20}$/u.test(productionRef) ||
    productionSupabaseProjectRefs.includes(supabaseRef) ||
    supabaseRef === productionRef
  )
    throw new Error('Require distinct reviewed Supabase project refs');
  return {
    supabaseOrigin: `https://${supabaseRef}.supabase.co`,
    app,
    baseURL: stagingOrigin(
      env.WAVE1_STAGING_BASE_URL ?? `https://${app}.staging.tutur3u.com`,
      app
    ),
    webOrigin: stagingOrigin(
      env.WAVE1_STAGING_WEB_ORIGIN ?? 'https://staging.tutur3u.com',
      'issuer'
    ),
    sha,
    workspace: required(env, 'WAVE1_STAGING_WORKSPACE_ID'),
  };
}

// Authentication is the only write admitted by the read-only Mail suite.
export function allowedRequest({
  url,
  method,
  baseURL,
  webOrigin,
  supabaseOrigin,
}: {
  url: string;
  method: string;
  baseURL: string;
  webOrigin: string;
  supabaseOrigin: string;
}): boolean {
  const target = new URL(url);
  if (target.origin === 'https://challenges.cloudflare.com')
    return ['GET', 'HEAD', 'OPTIONS', 'POST'].includes(method);
  if (target.origin === supabaseOrigin)
    return (
      ['GET', 'HEAD', 'OPTIONS'].includes(method) ||
      (method === 'POST' && target.pathname.startsWith('/auth/v1/'))
    );
  if (![baseURL, webOrigin].includes(target.origin)) return false;
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  if (
    target.origin === 'https://meet.staging.tutur3u.com' &&
    method === 'POST' &&
    /^\/api\/meet-call\/[a-f0-9-]{36}\/token$/iu.test(target.pathname)
  )
    return true;
  return (
    method === 'POST' && /^\/api\/(?:auth\/|v1\/auth\/)/u.test(target.pathname)
  );
}
