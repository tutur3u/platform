export const LMS_ORIGIN = 'https://tuturuuu.com';
export const LMS_BASE = '/lms';

export function lmsArea(path: string): 'TEACH' | 'LEARN' | undefined {
  const [, , area] = path.split('/', 3);
  if (area === 'teach') return 'TEACH';
  if (area === 'learn') return 'LEARN';
  return undefined;
}

export function lmsLoginDestination(next: string | null): URL {
  const target = new URL(LMS_BASE, LMS_ORIGIN);
  if (next?.startsWith('/') && !next.startsWith('//') && !next.includes('\\')) {
    const requested = new URL(next, LMS_ORIGIN);
    if (
      requested.origin === LMS_ORIGIN &&
      (requested.pathname === LMS_BASE ||
        requested.pathname.startsWith(`${LMS_BASE}/`)) &&
      requested.pathname !== `${LMS_BASE}/login`
    ) {
      target.pathname = requested.pathname;
      target.search = requested.search;
    }
  }
  const verify = new URL('/verify-token', LMS_ORIGIN);
  verify.searchParams.set('nextUrl', target.pathname + target.search);
  const login = new URL('/login', LMS_ORIGIN);
  login.searchParams.set('returnUrl', verify.href);
  return login;
}
