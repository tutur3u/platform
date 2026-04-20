import { type NextRequest, NextResponse } from 'next/server';

const SUPABASE_AUTH_COOKIE_PATTERN = /^sb-[A-Za-z0-9-]+-auth-token(?:\.\d+)?$/u;
const CLEAR_SITE_DATA_VALUE =
  '"cache", "cookies", "storage", "executionContexts"';

function getAuthCookieNames(request: NextRequest): string[] {
  return request.cookies
    .getAll()
    .map((cookie) => cookie.name)
    .filter((cookieName) => SUPABASE_AUTH_COOKIE_PATTERN.test(cookieName));
}

function applyNoStoreHeaders(response: NextResponse) {
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  response.headers.set('CDN-Cache-Control', 'no-store');
  response.headers.set('Clear-Site-Data', CLEAR_SITE_DATA_VALUE);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const redirectUrl = new URL('/login?browserStateReset=1', request.nextUrl);
  const response = NextResponse.redirect(redirectUrl);

  applyNoStoreHeaders(response);

  for (const cookieName of getAuthCookieNames(request)) {
    response.cookies.set(cookieName, '', {
      expires: new Date(0),
      maxAge: 0,
      path: '/',
    });
  }

  return response;
}
