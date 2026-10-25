import {
  PORTLESS_INTERNAL_APP_DOMAINS,
  PRODUCTION_INTERNAL_APP_DOMAINS,
} from '@tuturuuu/utils/internal-domains';

export function passwordsStepUpTarget(
  app: unknown,
  next: unknown
): string | null {
  if (app !== 'passwords' || typeof next !== 'string' || next.length > 4096)
    return null;
  try {
    const url = new URL(next);
    const origins = [
      ...PRODUCTION_INTERNAL_APP_DOMAINS,
      ...PORTLESS_INTERNAL_APP_DOMAINS,
    ]
      .filter((entry) => entry.name === 'passwords')
      .map((entry) => new URL(entry.url).origin);
    const path = decodeURIComponent(url.pathname);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hash ||
      !origins.includes(url.origin) ||
      path.startsWith('//') ||
      path.includes('\\') ||
      /^\/(?:en\/|vi\/)?(?:api|login|verify-token)(?:\/|$)/u.test(path) ||
      url.searchParams.getAll('state').length !== 1 ||
      !/^[A-Za-z0-9_-]{43}$/u.test(url.searchParams.get('state') ?? '') ||
      ['token', 'code', 'next', 'nextUrl', 'returnUrl'].some((key) =>
        url.searchParams.has(key)
      )
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function passwordsHandoffTarget(
  value: unknown,
  next: string
): string | null {
  if (typeof value !== 'string') return null;
  try {
    const target = new URL(next);
    const handoff = new URL(value);
    if (
      handoff.origin !== target.origin ||
      handoff.username ||
      handoff.password ||
      handoff.hash ||
      handoff.pathname !== '/verify-token' ||
      handoff.searchParams.get('targetApp') !== 'passwords' ||
      handoff.searchParams.getAll('token').length !== 1 ||
      !handoff.searchParams.get('token')
    )
      return null;
    const returned = new URL(
      handoff.searchParams.get('nextUrl') ?? '',
      target.origin
    );
    return returned.toString() === target.toString()
      ? handoff.toString()
      : null;
  } catch {
    return null;
  }
}
