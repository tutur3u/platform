import { NextResponse } from 'next/server';
import { exchangeSepayAuthorizationCode } from '@/lib/sepay-api';
import { encryptSepayToken } from '@/lib/sepay-crypto';
import { getSepayOauthEnv, verifySepayOauthState } from '@/lib/sepay-oauth';
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

export async function GET(request: Request, { params }: Params) {
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

  const oauthEnv = getSepayOauthEnv();
  if (!oauthEnv.stateSecret) {
    return NextResponse.json(
      { message: 'SePay OAuth state secret is not configured' },
      { status: 500 }
    );
  }

  const verifiedState = verifySepayOauthState({
    secret: oauthEnv.stateSecret,
    state,
  });

  if (!verifiedState.ok) {
    return NextResponse.json(
      { message: 'Invalid SePay OAuth state' },
      { status: 400 }
    );
  }

  const access = await requireSepayAccess(request, wsId);
  if ('error' in access) {
    return access.error;
  }

  if (verifiedState.wsId !== access.wsId) {
    return NextResponse.json(
      { message: 'OAuth callback workspace mismatch' },
      { status: 400 }
    );
  }

  const featureError = await requireSepayFeatureEnabled({
    sbAdmin: access.sbAdmin,
    wsId: access.wsId,
  });

  if (featureError) {
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
    return NextResponse.json(
      { message: 'Failed to exchange SePay OAuth code' },
      { status: 502 }
    );
  }

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
    console.error('Failed to save SePay connection:', upsertError);
    return NextResponse.json(
      { message: 'Failed to save SePay OAuth connection' },
      { status: 500 }
    );
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

    return NextResponse.json({
      success: true,
      sync: syncResult,
      webhook: webhookResult,
    });
  } catch (error) {
    console.error('SePay post-connect provisioning failed:', error);
    return NextResponse.json(
      {
        message:
          'Connected SePay account but failed to finish provisioning. Retry sync/provision endpoints.',
      },
      { status: 502 }
    );
  }
}
