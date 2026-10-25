import { createFunctionProxy } from '@tuturuuu/start-bridge/function-proxy';
import { guardApiProxyRequest } from '@tuturuuu/utils/api-proxy-guard';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { nativeMethodStatus } from './mail-api-policy';

const rootProxy = createFunctionProxy({ targetApp: 'mail' });
export async function nativeFunctionProxy(request: NextRequest) {
  if (!request.nextUrl.basePath) return rootProxy(request);
  const status = nativeMethodStatus(
    request.method,
    request.headers.get('content-type')
  );
  if (status !== 200)
    return new NextResponse(null, {
      status,
      headers: status === 405 ? { Allow: 'GET, POST' } : undefined,
    });
  return (
    (await guardApiProxyRequest(request, {
      prefixBase: 'proxy:mail:functions',
    })) ?? NextResponse.next()
  );
}
