/** Shared with start-bridge across its SSR and RSC module graphs. */
const POLICY_KEY = Symbol.for('tuturuuu.internalApi.webApiOriginPolicy');
type WebApiOriginPolicy = (env: Record<string, string | undefined>) => string;

/** Validate the raw binding before normalization, fallback or credential forwarding. */
export function getValidatedInternalWebApiOrigin(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  const policy = (globalThis as Record<symbol, WebApiOriginPolicy | undefined>)[
    POLICY_KEY
  ];
  return policy ? policy(env) : env.INTERNAL_WEB_API_ORIGIN;
}

// Mirrors RETIRED_APP_HOSTNAMES in @tuturuuu/utils/retired-app-hosts, which
// this package does not depend on. A stale env value naming one must never
// receive forwarded auth.
const RETIRED_APP_HOSTNAMES = ['rewise.me', 'rewise.school'];

export function resolveConfiguredOrigin(value?: string): string | null {
  if (!value) {
    return null;
  }

  const [firstValue] = value
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!firstValue) {
    return null;
  }

  const normalized = /^[a-z]+:\/\//iu.test(firstValue)
    ? firstValue
    : `https://${firstValue}`;

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }

  return !isRetiredAppHostname(url.hostname) ? url.origin : null;
}

function isRetiredAppHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.+$/u, '');

  return RETIRED_APP_HOSTNAMES.some(
    (retired) => host === retired || host.endsWith(`.${retired}`)
  );
}
