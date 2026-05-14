import {
  clearAppSessionAndReturn,
  clearSupabaseAuthCookies,
} from '@tuturuuu/auth/app-session';
import { type NextRequest, NextResponse } from 'next/server';
import { createHivePublicUrl } from '@/lib/hive-public-url';

function wantsJsonResponse(request: NextRequest) {
  const accept = request.headers.get('accept') ?? '';
  return accept.includes('application/json') && !accept.includes('text/html');
}

function createLogoutResponse(request: NextRequest) {
  const response = wantsJsonResponse(request)
    ? NextResponse.json({ success: true })
    : NextResponse.redirect(createHivePublicUrl('/login', request), {
        status: 303,
      });

  return clearSupabaseAuthCookies(request, clearAppSessionAndReturn(response));
}

export function GET(request: NextRequest) {
  return createLogoutResponse(request);
}

export const POST = GET;
