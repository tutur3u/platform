import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { extractIPFromHeaders } from '@tuturuuu/utils/abuse-protection';
import { connection, NextResponse } from 'next/server';
import {
  MOBILE_DEPLOYMENT_ENVIRONMENT,
  MOBILE_DEPLOYMENT_PLATFORMS,
  type MobileDeploymentPlatform,
} from '@/lib/mobile-deployment/constants';
import {
  MobileDeploymentOidcError,
  verifyGitHubOidcToken,
} from '@/lib/mobile-deployment/oidc';
import {
  fetchMobileDeploymentBundle,
  MobileDeploymentStoreError,
} from '@/lib/mobile-deployment/store';

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    },
    status,
  });
}

function parseBearerToken(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const [scheme, token] = authorization.split(/\s+/u);
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }

  return token;
}

function parsePlatform(value: string | null): MobileDeploymentPlatform | null {
  return MOBILE_DEPLOYMENT_PLATFORMS.includes(value as MobileDeploymentPlatform)
    ? (value as MobileDeploymentPlatform)
    : null;
}

export async function GET(request: Request) {
  await connection();

  const url = new URL(request.url);
  const environment = url.searchParams.get('environment');
  const platform = parsePlatform(url.searchParams.get('platform'));
  const token = parseBearerToken(request);
  const oidcToken = request.headers.get('x-github-oidc-token') || '';

  if (environment !== MOBILE_DEPLOYMENT_ENVIRONMENT || !platform || !token) {
    return noStoreJson({ message: 'Unauthorized' }, 401);
  }

  let stage: 'oidc' | 'admin_client' | 'bundle' = 'oidc';
  try {
    const claims = await verifyGitHubOidcToken(oidcToken);
    stage = 'admin_client';
    const db = await createAdminClient({ noCookie: true });
    stage = 'bundle';
    const bundle = await fetchMobileDeploymentBundle({
      claims,
      db,
      platform,
      requestIp: extractIPFromHeaders(request.headers),
      token,
    });

    return noStoreJson(bundle);
  } catch (error) {
    const code =
      error instanceof MobileDeploymentOidcError ||
      error instanceof MobileDeploymentStoreError
        ? error.code
        : 'unexpected_error';
    console.warn('Mobile deployment bundle request denied', { stage, code });
    if (error instanceof MobileDeploymentStoreError && error.status !== 401) {
      return noStoreJson(
        { message: 'Mobile deployment bundle unavailable' },
        409
      );
    }

    return noStoreJson({ message: 'Unauthorized' }, 401);
  }
}
