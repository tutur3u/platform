import type { MailProvider } from './config';

const CALLBACK_PATH = '/api/v1/mail/connected/callback';

export type MailOAuthCallback = {
  /** Path Mail is mounted under on this origin (`/mail` on the apex, else ''). */
  basePath: string;
  /** Path the state cookie is scoped to, so it reaches only the callback. */
  cookiePath: string;
  redirectUri: string;
};

function parseCallbackUri(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * Registered callbacks for a provider. `MAIL_<P>_REDIRECT_URI` stays the
 * primary (the Mail subdomain); `MAIL_<P>_ONE_ORIGIN_REDIRECT_URI` adds the
 * shared-origin callback (`https://tuturuuu.com/mail/...`) while both are
 * registered with the provider during migration.
 */
export function mailOAuthCallbackUris(provider: MailProvider): URL[] {
  const prefix = provider === 'google' ? 'GOOGLE' : 'MICROSOFT';
  const uris = [
    parseCallbackUri(process.env[`MAIL_${prefix}_REDIRECT_URI`]),
    parseCallbackUri(process.env[`MAIL_${prefix}_ONE_ORIGIN_REDIRECT_URI`]),
  ].filter((uri): uri is URL => uri !== null);
  return uris.filter(
    (uri, index) => uris.findIndex((other) => other.href === uri.href) === index
  );
}

/**
 * Choose the registered callback on the origin that served this request, so
 * the state cookie is set and read on the same host. Requests from any other
 * origin keep the primary callback, which preserves the pre-migration flow.
 */
export function selectMailOAuthCallback(
  provider: MailProvider,
  requestUrl?: string
): MailOAuthCallback {
  const uris = mailOAuthCallbackUris(provider);
  let origin: string | null = null;
  try {
    origin = requestUrl ? new URL(requestUrl).origin : null;
  } catch {
    origin = null;
  }
  const selected =
    (origin && uris.find((uri) => uri.origin === origin)) || uris[0];
  if (!selected) throw new Error('Mail OAuth is not configured');
  const basePath = selected.pathname.endsWith(CALLBACK_PATH)
    ? selected.pathname.slice(0, -CALLBACK_PATH.length)
    : '';
  return {
    basePath,
    cookiePath: `${basePath}/api/v1/mail/connected`,
    redirectUri: selected.href,
  };
}
