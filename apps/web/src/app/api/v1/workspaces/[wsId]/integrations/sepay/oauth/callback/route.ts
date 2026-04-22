import { type NextRequest, NextResponse } from 'next/server';
import { exchangeSepayAuthorizationCode } from '@/lib/sepay-api';
import { encryptSepayToken } from '@/lib/sepay-crypto';
import {
  getSepayOauthStateCookieName,
  verifySepayOauthState,
} from '@/lib/sepay-oauth';
import {
  buildSepayOauthCallbackUrl,
  provisionSepayWebhookEndpoint,
  syncSepayBankAccounts,
} from '../../service';
import { requireSepayAccess, requireSepayFeatureEnabled } from '../../shared';

interface Params {
  params: Promise<{ wsId: string }>;
}

function getQueryValue(url: URL, key: string) {
  const value = url.searchParams.get(key);
  return value && value.trim().length > 0 ? value.trim() : null;
}

function clearOauthStateCookie(
  response: NextResponse,
  request: NextRequest,
  wsId: string
) {
  response.cookies.set(getSepayOauthStateCookieName(wsId), '', {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: request.nextUrl.pathname,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function GET(request: NextRequest, { params }: Params) {
  const { wsId } = await params;
  const url = new URL(request.url);
  const code = getQueryValue(url, 'code');
  const state = getQueryValue(url, 'state');

  if (!code || !state) {
    return NextResponse.json(
      { message: 'Missing SePay OAuth callback parameters' },
      { status: 400 }
    );
  }

  const verifiedState = verifySepayOauthState({
    expectedState:
      request.cookies.get(getSepayOauthStateCookieName(wsId))?.value ?? null,
    state,
  });

  if (!verifiedState.ok) {
    const response = NextResponse.json(
      { message: 'Invalid SePay OAuth state' },
      { status: 400 }
    );
    clearOauthStateCookie(response, request, wsId);
    return response;
  }

  const access = await requireSepayAccess(request, wsId);
  if ('error' in access) {
    clearOauthStateCookie(access.error, request, wsId);
    return access.error;
  }

  const featureError = await requireSepayFeatureEnabled({
    sbAdmin: access.sbAdmin,
    wsId: access.wsId,
  });

  if (featureError) {
    clearOauthStateCookie(featureError, request, wsId);
    return featureError;
  }

  const callbackUrl = buildSepayOauthCallbackUrl(access.wsId);

  let exchanged: Awaited<ReturnType<typeof exchangeSepayAuthorizationCode>>;
  try {
    exchanged = await exchangeSepayAuthorizationCode({
      code,
      redirectUri: callbackUrl,
    });
  } catch (error) {
    console.error('SePay OAuth exchange failed:', error);
    const response = NextResponse.json(
      { message: 'Failed to exchange SePay OAuth code' },
      { status: 502 }
    );
    clearOauthStateCookie(response, request, wsId);
    return response;
  }

  try {
    const encryptedAccessToken = encryptSepayToken(exchanged.accessToken);
    const encryptedRefreshToken = encryptSepayToken(exchanged.refreshToken);

    const { error: upsertError } = await access.sbAdmin
      .from('sepay_connections')
      .upsert(
        {
          access_token_encrypted: encryptedAccessToken,
          access_token_expires_at: exchanged.expiresAt,
          refresh_token_encrypted: encryptedRefreshToken,
          scopes: exchanged.scopes,
          status: 'active',
          updated_at: new Date().toISOString(),
          ws_id: access.wsId,
        },
        { onConflict: 'ws_id' }
      );

    if (upsertError) {
      throw upsertError;
    }
  } catch (error) {
    console.error('Failed to save SePay connection:', error);
    const response = NextResponse.json(
      { message: 'Failed to save SePay OAuth connection' },
      { status: 500 }
    );
    clearOauthStateCookie(response, request, wsId);
    return response;
  }

  try {
    const syncResult = await syncSepayBankAccounts({
      sbAdmin: access.sbAdmin,
      wsId: access.wsId,
    });
    const webhookResult = await provisionSepayWebhookEndpoint({
      sbAdmin: access.sbAdmin,
      wsId: access.wsId,
    });

    const response = NextResponse.json({
      success: true,
      sync: syncResult,
      webhook: webhookResult,
    });
    clearOauthStateCookie(response, request, wsId);
    return response;
  } catch (error) {
    console.error('SePay post-connect provisioning failed:', error);
    const response = NextResponse.json(
      {
        message:
          'Connected SePay account but failed to finish provisioning. Retry sync/provision endpoints.',
      },
      { status: 502 }
    );
    clearOauthStateCookie(response, request, wsId);
    return response;
  }
}
