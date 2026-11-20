import { getCloudflareContext } from '@opennextjs/cloudflare/cloudflare-context';
import type { AbuseGuardBinding } from '@tuturuuu/utils/abuse-guard/client';
import { configureAbuseGuardRuntime } from '@tuturuuu/utils/abuse-guard/select';
import { type NextRequest, NextResponse } from 'next/server';
import { withStagingOriginProof } from './staging-origin-proof';

declare global {
  interface CloudflareEnv {
    ABUSE_GUARD?: AbuseGuardBinding;
    ABUSE_GUARD_FAMILIES?: string;
    ABUSE_GUARD_KEY_PEPPER?: string;
    ABUSE_GUARD_TIMEOUT_MS?: string;
  }
}

/** Installs the API identity Worker's binding in the current server bundle. */
export function configureWebIdentityAbuseGuard() {
  if (process.env.TUTURUUU_SERVICE_NAME !== 'web-api-identity') return;

  const { env } = getCloudflareContext();
  configureAbuseGuardRuntime(
    env.ABUSE_GUARD
      ? {
          binding: env.ABUSE_GUARD,
          families: env.ABUSE_GUARD_FAMILIES,
          pepper: env.ABUSE_GUARD_KEY_PEPPER,
          timeoutMs: env.ABUSE_GUARD_TIMEOUT_MS,
        }
      : null
  );
}

export function withWebProxyGuards(
  proxy: (request: NextRequest) => Promise<NextResponse>
) {
  return withStagingOriginProof(
    async (request: NextRequest) => {
      configureWebIdentityAbuseGuard();
      return proxy(request);
    },
    () =>
      new NextResponse('Forbidden', {
        status: 403,
        headers: { 'Cache-Control': 'no-store' },
      })
  );
}
