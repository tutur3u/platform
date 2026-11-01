import { stagingProfile } from '../cloudflare/profile.ts';

export type Locale = 'en' | 'vi';
type Env = Record<string, string | undefined>;
export function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Required staging input: ${name}`);
  return value;
}
export function stagingOrigin(value: string, role: 'contacts' | 'issuer') {
  const url = new URL(value);
  const host = role === 'contacts' ? stagingProfile.host : 'web.tutur3u.com';
  if (
    url.origin !== `https://${host}` ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Refusing a production, canonical or unreviewed staging origin'
    );
  }
  return url.origin;
}
export function relativePath(path: string) {
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    /[\\#\r\n]/u.test(path) ||
    new URL(path, 'https://staging.invalid').origin !==
      'https://staging.invalid'
  ) {
    throw new Error('Expected a same-origin staging path');
  }
  return path;
}
export function localized(path: string, locale: Locale) {
  return `/${locale}${relativePath(path)}`;
}
export function readConfig(env: Env) {
  if (env.CONTACTS_STAGING_DISPOSABLE_ACCOUNT !== 'confirmed')
    throw new Error('Owner must confirm disposable staging resources');
  const sha = required(env, 'CONTACTS_STAGING_SOURCE_SHA');
  if (!/^[a-f0-9]{40}$/u.test(sha))
    throw new Error('Require full staging source SHA');
  if (
    required(env, 'CONTACTS_STAGING_SUPABASE_PROJECT_REF') !==
    stagingProfile.supabaseRef
  )
    throw new Error('Require the pinned staging Supabase project');
  return {
    sha,
    baseURL: stagingOrigin(
      env.CONTACTS_STAGING_BASE_URL ?? `https://${stagingProfile.host}`,
      'contacts'
    ),
    webOrigin: stagingOrigin(
      env.CONTACTS_STAGING_WEB_ORIGIN ?? 'https://web.tutur3u.com',
      'issuer'
    ),
    supabaseOrigin: stagingProfile.supabaseUrl,
    workspace: required(env, 'CONTACTS_STAGING_WORKSPACE_ID'),
  };
}
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
}) {
  // Validate the configured destinations again so callers cannot bypass readConfig.
  stagingOrigin(baseURL, 'contacts');
  stagingOrigin(webOrigin, 'issuer');
  if (supabaseOrigin !== stagingProfile.supabaseUrl) return false;
  const target = new URL(url);
  if (target.username || target.password) return false;
  if (target.origin === 'https://challenges.cloudflare.com')
    return ['GET', 'HEAD', 'OPTIONS', 'POST'].includes(method);
  if (target.origin === supabaseOrigin)
    return (
      ['GET', 'HEAD', 'OPTIONS'].includes(method) ||
      (method === 'POST' && target.pathname.startsWith('/auth/v1/'))
    );
  if (![baseURL, webOrigin].includes(target.origin)) return false;
  return (
    ['GET', 'HEAD', 'OPTIONS'].includes(method) ||
    (method === 'POST' &&
      /^\/api\/(?:auth\/|v1\/auth\/)/u.test(target.pathname))
  );
}
