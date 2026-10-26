import { getRequestHeadersWithResponseCookies } from '@tuturuuu/auth/proxy';
import { createFunctionProxy } from '@tuturuuu/start-bridge/function-proxy';
import { NextResponse } from 'next/server';
import { resolveCalendarLocale } from './request-locale';
export const nativeFunctionProxy = createFunctionProxy({
  targetApp: 'calendar',
  continueWith(request, sessionResponse) {
    const headers = getRequestHeadersWithResponseCookies(
      request,
      sessionResponse
    );
    headers.set(
      'x-next-intl-locale',
      resolveCalendarLocale({ url: request.url, headers })
    );
    const continuation = NextResponse.next({ request: { headers } });
    for (const [name, value] of sessionResponse.headers)
      if (name !== 'set-cookie' && !name.startsWith('x-middleware-'))
        continuation.headers.set(name, value);
    for (const value of sessionResponse.headers.getSetCookie())
      continuation.headers.append('set-cookie', value);
    return continuation;
  },
});
