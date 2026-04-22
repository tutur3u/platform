import { NextResponse } from 'next/server';
import {
  buildSepayOauthAuthorizeUrl,
  createSepayOauthState,
  getSepayOauthEnv,
  getSepayOauthStateCookieName,
  getSepayOauthStateMaxAgeSeconds,
} from '@/lib/sepay-oauth';
import { buildSepayOauthCallbackUrl } from '../../service';
import { requireSepayAccess, requireSepayFeatureEnabled } from '../../shared';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function POST(request: Request, { params }: Params) {
  const access = await requireSepayAccess(request, (await params).wsId);
  if ('error' in access) {
    return access.error;
  }

  const featureError = await requireSepayFeatureEnabled({
    sbAdmin: access.sbAdmin,
    wsId: access.wsId,
  });

  if (featureError) {
    return featureError;
  }

  const env = getSepayOauthEnv();
  if (!env.authorizeUrl || !env.clientId) {
    return NextResponse.json(
      { message: 'SePay OAuth is not configured' },
      { status: 500 }
    );
  }

  const callbackUrl = buildSepayOauthCallbackUrl(access.wsId);
  const callbackPath = new URL(callbackUrl).pathname;
  const oauthState = createSepayOauthState();
  const authorizeUrl = buildSepayOauthAuthorizeUrl({
    authorizeUrl: env.authorizeUrl,
    clientId: env.clientId,
    redirectUri: callbackUrl,
    scope: process.env.SEPAY_OAUTH_SCOPE,
    state: oauthState.state,
  });

  const response = NextResponse.json({
    authorizeUrl,
    callbackUrl,
    state: oauthState.state,
  });

  response.cookies.set(
    getSepayOauthStateCookieName(access.wsId),
    oauthState.state,
    {
      httpOnly: true,
      maxAge: getSepayOauthStateMaxAgeSeconds(),
      path: callbackPath,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    }
  );

  return response;
}
