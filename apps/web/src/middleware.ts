import { Database } from '@/types/supabase';
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextRequest, NextResponse } from 'next/server';

import i18n from '../i18n.json';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Create a Supabase client configured to use cookies
  const supabase = createMiddlewareClient<Database>({ req, res });

  // Refresh session if expired - required for Server Components
  // https://supabase.com/docs/guides/auth/auth-helpers/nextjs#managing-session-with-middleware
  await supabase.auth.getSession();

  const langInCookie = req.cookies.get('lang');
  const locale =
    langInCookie?.value || req.nextUrl.locale || i18n.defaultLocale;

  console.log('locale', locale);

  // if lang is not in cookie, set it
  if (!langInCookie) {
    const search = req.nextUrl.search;
    const lang = search.match(/lang=([a-z]{2})/)?.[1];
    res.cookies.set('lang', lang);
  }

  req.nextUrl.searchParams.set('lang', locale);
  // NextResponse.rewrite(req.nextUrl);

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - monitoring (analytics)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|monitoring).*)',
  ],
};
