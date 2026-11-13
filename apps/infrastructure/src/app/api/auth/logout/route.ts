import { createAppSessionLogoutResponse } from '@tuturuuu/auth/app-session';
import { type NextRequest, NextResponse } from 'next/server';

export function GET(_request: NextRequest) {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } });
}

export function POST(request: NextRequest) {
  if (request.method !== 'POST') return GET(request);

  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (
    origin !== new URL(request.url).origin ||
    (fetchSite !== null && fetchSite !== 'same-origin')
  ) {
    return new NextResponse(null, { status: 403 });
  }

  const response = createAppSessionLogoutResponse(request, {
    redirectUrl: new URL('/login', request.url),
  });
  if (response.headers.has('location')) {
    response.headers.set('location', '/login');
  }
  return response;
}
