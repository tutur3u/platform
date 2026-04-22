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

function buildIntegrationsRedirectUrl(input: {
  reason?: string;
  status: 'connected' | 'error';
  wsId: string;
}) {
  const url = new URL(
    `/${encodeURIComponent(input.wsId)}/integrations`,
    'http://localhost'
  );
  url.searchParams.set('sepay', input.status);

  if (input.reason) {
    url.searchParams.set('reason', input.reason);
  }

  return `${url.pathname}${url.search}`;
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

function redirectToIntegrations(input: {
  reason?: string;
  request: NextRequest;
  status: 'connected' | 'error';
  wsId: string;
}) {
  const response = NextResponse.redirect(
    new URL(
      buildIntegrationsRedirectUrl({
        reason: input.reason,
        status: input.status,
        wsId: input.wsId,
      }),
      input.request.url
    ),
    { status: 302 }
  );

  clearOauthStateCookie(response, input.request, input.wsId);
  return response;
}

export async function GET(request: NextRequest, { params }: Params) {
  const { wsId } = await params;
  const url = new URL(request.url);
  const code = getQueryValue(url, 'code');
  const state = getQueryValue(url, 'state');

  if (!code || !state) {
    return redirectToIntegrations({
      reason: 'missing_callback_params',
      request,
      status: 'error',
      wsId,
    });
  }

  const verifiedState = verifySepayOauthState({
    expectedState:
      request.cookies.get(getSepayOauthStateCookieName(wsId))?.value ?? null,
    state,
  });

  if (!verifiedState.ok) {
    return redirectToIntegrations({
      reason: 'invalid_oauth_state',
      request,
      status: 'error',
      wsId,
    });
  }

  const access = await requireSepayAccess(request, wsId);
  if ('error' in access) {
    return redirectToIntegrations({
      reason: 'unauthorized',
      request,
      status: 'error',
      wsId,
    });
  }

  const featureError = await requireSepayFeatureEnabled({
    sbAdmin: access.sbAdmin,
    wsId: access.wsId,
  });

  if (featureError) {
    return redirectToIntegrations({
      reason: 'feature_disabled',
      request,
      status: 'error',
      wsId: access.wsId,
    });
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
    return redirectToIntegrations({
      reason: 'oauth_exchange_failed',
      request,
      status: 'error',
      wsId: access.wsId,
    });
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
    return redirectToIntegrations({
      reason: 'connection_save_failed',
      request,
      status: 'error',
      wsId: access.wsId,
    });
  }

  try {
    await syncSepayBankAccounts({
      sbAdmin: access.sbAdmin,
      wsId: access.wsId,
    });
    await provisionSepayWebhookEndpoint({
      sbAdmin: access.sbAdmin,
      wsId: access.wsId,
    });
    return redirectToIntegrations({
      request,
      status: 'connected',
      wsId: access.wsId,
    });
  } catch (error) {
    console.error('SePay post-connect provisioning failed:', error);
    return redirectToIntegrations({
      reason: 'post_connect_provisioning_failed',
      request,
      status: 'error',
      wsId: access.wsId,
    });
  }
}
