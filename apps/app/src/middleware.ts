import { createMiddlewareSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  // We need to create a response and hand it to the supabase client to be able to modify the response headers.
  const res = NextResponse.next();
  // Create authenticated Supabase Client.
  const supabase = createMiddlewareSupabaseClient({ req, res });
  // Check if we have a session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // If no session, redirect to login page.
  if (!session) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set(`redirectedFrom`, req.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const userQuery = supabase
    .from('users')
    .select('email, display_name, username')
    .eq('id', session?.user.id)
    .single();

  const orgsQuery = supabase.from('orgs').select('id').limit(1);

  const [userRes, orgsRes] = await Promise.all([userQuery, orgsQuery]);

  const { data: user, error: userError } = userRes;
  const { data: orgs, error: orgsError } = orgsRes;

  const hasUserData = user?.email && user?.display_name && user?.username;
  const hasOrgsData = orgs && orgs?.length > 0;
  const hasErrors = userError || orgsError;

  // Check auth condition
  if (!hasErrors && hasUserData && hasOrgsData) {
    // Authentication successful, forward request to protected route.
    return res;
  }

  // Auth condition not met, redirect to onboarding page.
  const redirectUrl = req.nextUrl.clone();
  redirectUrl.pathname = '/onboarding';
  redirectUrl.searchParams.set(`redirectedFrom`, req.nextUrl.pathname);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - robots.txt (robots file)
     * - sitemap.xml (sitemap file)
     * - login (login page)
     * - onboarding (onboarding page)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|login|onboarding).*)',
  ],
};
