import { createAppSessionLogoutResponse } from '@tuturuuu/auth/app-session';
import type { NextRequest } from 'next/server';
import { WEB_APP_URL } from '@/constants/common';

function getCentralLogoutUrl() {
  const url = new URL('/logout', WEB_APP_URL);
  url.searchParams.set('from', 'Infra');
  return url;
}

export function GET(request: NextRequest) {
  return createAppSessionLogoutResponse(request, {
    redirectUrl: getCentralLogoutUrl(),
  });
}

export const POST = GET;
