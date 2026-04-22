import { type NextRequest, NextResponse } from 'next/server';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import { defaultLocale, supportedLocales } from '@/i18n/routing';
import { exchangeSepayAuthorizationCode } from '@/lib/sepay-api';
import { encryptSepayToken } from '@/lib/sepay-crypto';
import {
  getSepayOauthStateCookieName,
  verifySepayOauthState,
} from '@/lib/sepay-oauth';
import {
  buildSepayOauthCallbackUrl,
  provisionSepayWebhookEndpoint,
  resolveSepayAppOrigin,
  syncSepayBankAccounts,
} from '../../service';
import { requireSepayAccess, requireSepayFeatureEnabled } from '../../shared';

interface Params {
  params: Promise<{ wsId: string }>;
}

function buildIntegrationsRedirectUrl(input: {
  locale: string;
  reason?: string;
  status: 'connected' | 'error';
  wsId: string;
}) {
  const url = new URL(
    `${input.locale === defaultLocale ? '' : `/${input.locale}`}/${encodeURIComponent(input.wsId)}/integrations`,
    resolveSepayAppOrigin()
  );
  url.searchParams.set('sepay', input.status);

  if (input.reason) {
    url.searchParams.set('reason', input.reason);
  }

  return url;
}

function getQueryValue(url: URL, key: string) {
  const value = url.searchParams.get(key);
  return value && value.trim().length > 0 ? value.trim() : null;
}

function clearOauthStateCookie(response: NextResponse, wsId: string) {
  const callbackPath = new URL(buildSepayOauthCallbackUrl(wsId)).pathname;

  response.cookies.set(getSepayOauthStateCookieName(wsId), '', {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    path: callbackPath,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

function resolveLocaleFromRequest(request: NextRequest) {
  const localeCookie = request.cookies.get(LOCALE_COOKIE_NAME)?.value;

  if (localeCookie && supportedLocales.includes(localeCookie as 'en' | 'vi')) {
    return localeCookie;
  }

  return defaultLocale;
}

function redirectToIntegrations(input: {
  reason?: string;
  request: NextRequest;
  status: 'connected' | 'error';
  wsId: string;
}) {
  const response = NextResponse.redirect(
    buildIntegrationsRedirectUrl({
      locale: resolveLocaleFromRequest(input.request),
      reason: input.reason,
      status: input.status,
      wsId: input.wsId,
    }),
    { status: 302 }
  );

  clearOauthStateCookie(response, input.wsId);
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

  const connectionUpsertTimestamp = new Date().toISOString();

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
          status: 'error',
          updated_at: connectionUpsertTimestamp,
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

    const { error: activateConnectionError } = await access.sbAdmin
      .from('sepay_connections')
      .update({
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('ws_id', access.wsId);

    if (activateConnectionError) {
      throw activateConnectionError;
    }

    return redirectToIntegrations({
      request,
      status: 'connected',
      wsId: access.wsId,
    });
  } catch (error) {
    console.error('SePay post-connect provisioning failed:', error);

    const { error: markErrorStatus } = await access.sbAdmin
      .from('sepay_connections')
      .update({
        status: 'error',
        updated_at: new Date().toISOString(),
      })
      .eq('ws_id', access.wsId);

    if (markErrorStatus) {
      console.error(
        'Failed to persist SePay connection provisioning error status:',
        markErrorStatus
      );
    }

    return redirectToIntegrations({
      reason: 'post_connect_provisioning_failed',
      request,
      status: 'error',
      wsId: access.wsId,
    });
  }
}
