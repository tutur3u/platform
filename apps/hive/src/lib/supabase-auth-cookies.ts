import type { NextRequest, NextResponse } from 'next/server';

const SUPABASE_AUTH_COOKIE_PATTERN = /^sb-[A-Za-z0-9-]+-auth-token(?:\.\d+)?$/u;

export function clearSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse
) {
  for (const cookie of request.cookies.getAll()) {
    if (!SUPABASE_AUTH_COOKIE_PATTERN.test(cookie.name)) {
      continue;
    }

    response.cookies.set(cookie.name, '', {
      expires: new Date(0),
      maxAge: 0,
      path: '/',
    });
  }

  return response;
}
