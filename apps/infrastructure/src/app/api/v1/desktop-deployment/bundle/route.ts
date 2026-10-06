import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  DesktopBundleError,
  fetchDesktopSigningBundle,
} from '@/lib/desktop-deployment/bundle-store';
import { desktopVaultEnabled } from '@/lib/desktop-deployment/contract';
import { verifyDesktopGitHubOidcToken } from '@/lib/desktop-deployment/oidc';
import { readDesktopBody } from '@/lib/desktop-deployment/request';

const bodySchema = z
  .object({ platform: z.enum(['windows', 'macos']) })
  .strict();
function response(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
  });
}

export async function POST(request: Request) {
  await connection();
  if (!desktopVaultEnabled(process.env.DESKTOP_DEPLOYMENT_VAULT_ENABLED))
    return response({ code: 'desktop_bundle_disabled' }, 503);
  const token = /^Bearer (ttr_desktop_ci_[A-Za-z0-9_-]{43})$/u.exec(
    request.headers.get('authorization') ?? ''
  )?.[1];
  const oidc = request.headers.get('x-github-oidc-token') ?? '';
  if (!token || !oidc || oidc.length > 16384)
    return response({ code: 'desktop_bundle_unauthorized' }, 401);
  let platform: 'windows' | 'macos';
  try {
    if (request.headers.get('content-type') !== 'application/json')
      throw new Error('Invalid body');
    const bytes = await readDesktopBody(request, 1024);
    try {
      platform = bodySchema.parse(JSON.parse(bytes.toString('utf8'))).platform;
    } finally {
      bytes.fill(0);
    }
  } catch {
    return response({ code: 'desktop_bundle_request_invalid' }, 400);
  }
  // Verify the independent fixed desktop trust contract BEFORE service access/token lookup.
  let claims: Awaited<ReturnType<typeof verifyDesktopGitHubOidcToken>>;
  try {
    claims = await verifyDesktopGitHubOidcToken(oidc);
  } catch {
    return response({ code: 'desktop_bundle_unauthorized' }, 401);
  }
  try {
    const db = await createAdminClient({ noCookie: true });
    return response(
      await fetchDesktopSigningBundle({ db, token, platform, claims }),
      200
    );
  } catch (error) {
    return response(
      {
        code:
          error instanceof DesktopBundleError
            ? error.code
            : 'desktop_bundle_unavailable',
      },
      error instanceof DesktopBundleError ? error.status : 500
    );
  }
}
