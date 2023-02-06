import { createMiddlewareSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === '/') {
    // If we are on the root page, we don't need to check for authentication.
    return NextResponse.next();
  }

  // Otherwise, we need to check if the user is authenticated.
  // We need to create a response and hand it to the supabase client to be able to modify the response headers.
  const res = NextResponse.next();

  // Create authenticated Supabase Client.
  const supabase = createMiddlewareSupabaseClient({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // If no session, redirect to login page.
  if (!session) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';

    // if we are not on the root page, we need to redirect
    // back to the page we were on after login.
    if (req.nextUrl.pathname !== '/')
      redirectUrl.searchParams.set(`redirectedFrom`, req.nextUrl.pathname);

    return NextResponse.redirect(redirectUrl);
  }

  // Authentication successful, forward request to protected route.
  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the root
     * directory and the ones starting with:
     * - api (API routes)
     * - media (media files)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - robots.txt (robots file)
     * - sitemap.xml (sitemap file)
     * - login (login page)
     */
    '/((?!api|media|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|login).*)',
  ],
};
