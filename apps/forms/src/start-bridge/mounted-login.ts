import { createMountedAppAuth } from '@tuturuuu/auth/proxy';
import type { NextRequest } from 'next/server';

const mounted = createMountedAppAuth({ targetApp: 'forms' });

export function mountedLogin(request: NextRequest) {
  if (
    !mounted.isMounted(request) ||
    !/^\/(?:en\/|vi\/)?login\/?$/u.test(request.nextUrl.pathname)
  )
    return null;
  return mounted.auth(request);
}
