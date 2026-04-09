import { NextResponse } from 'next/server';
import {
  buildSepayOauthAuthorizeUrl,
  createSepayOauthState,
  getSepayOauthEnv,
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
  if (!env.authorizeUrl || !env.clientId || !env.stateSecret) {
    return NextResponse.json(
      { message: 'SePay OAuth is not configured' },
      { status: 500 }
    );
  }

  const callbackUrl = buildSepayOauthCallbackUrl(access.wsId);
  const oauthState = createSepayOauthState({
    secret: env.stateSecret,
    wsId: access.wsId,
  });
  const authorizeUrl = buildSepayOauthAuthorizeUrl({
    authorizeUrl: env.authorizeUrl,
    clientId: env.clientId,
    redirectUri: callbackUrl,
    scope: process.env.SEPAY_OAUTH_SCOPE,
    state: oauthState.state,
  });

  return NextResponse.json({
    authorizeUrl,
    callbackUrl,
    expiresAt: oauthState.expiresAt,
    state: oauthState.state,
  });
}
