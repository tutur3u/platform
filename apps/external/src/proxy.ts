import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function proxy(req: NextRequest): Promise<NextResponse> {
  if (
    req.nextUrl.pathname.startsWith('/api/storage') &&
    process.env.NODE_ENV !== 'development'
  ) {
    return NextResponse.json(
      { error: 'Storage demo is only available in local development' },
      { status: 403 }
    );
  }
  if (req.nextUrl.pathname.startsWith('/api')) {
    const guardResponse = await guardApiProxyRequest(req, {
      prefixBase: 'proxy:external:api',
    });
    if (guardResponse) {
      return guardResponse;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
