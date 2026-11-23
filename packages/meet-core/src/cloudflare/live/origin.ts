import { MEET_CANONICAL_ORIGIN } from '@tuturuuu/utils/meet-url';

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    const { origin } = new URL(value);
    return origin === 'null' ? null : origin;
  } catch {
    return null;
  }
}

/**
 * Meet is served from its legacy subdomain and the shared tuturuuu.com origin,
 * so the Live socket accepts both. Parley has no shared mount and only accepts
 * its own configured origin.
 */
export function liveSocketOriginAllowed(
  headers: Pick<Headers, 'get'>,
  app: 'meet' | 'parley' | undefined,
  env: { NEXT_PUBLIC_APP_URL: string; PARLEY_APP_URL?: string }
) {
  const requested = normalizeOrigin(headers.get('Origin'));
  if (!requested) return false;
  const allowed = [
    normalizeOrigin(
      app === 'parley' ? env.PARLEY_APP_URL : env.NEXT_PUBLIC_APP_URL
    ),
  ];
  if (app !== 'parley') allowed.push(MEET_CANONICAL_ORIGIN);
  return allowed.includes(requested);
}
