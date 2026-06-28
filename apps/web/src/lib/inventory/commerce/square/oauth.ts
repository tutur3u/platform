import 'server-only';

import { randomBytes } from 'node:crypto';
import {
  createSquareAuthorizeUrl,
  exchangeSquareOAuthCode,
  parseSquareScopes,
} from './client';
import { upsertConnectionToken, validateConnection } from './connection-store';
import {
  getPrivateAdmin,
  type SupabaseErrorLike,
  upsertSettings,
} from './settings-store';
import type { SquareEnvironment } from './types';

type SquareOAuthStateRow = {
  created_by: string | null;
  environment: SquareEnvironment;
  expires_at: string;
  return_to: string | null;
  state: string;
  ws_id: string;
};

export async function createInventorySquareOAuthStart({
  environment,
  origin,
  returnTo,
  userId,
  wsId,
}: {
  environment: SquareEnvironment;
  origin: string;
  returnTo?: string | null;
  userId: string;
  wsId: string;
}) {
  const privateAdmin = await getPrivateAdmin();
  const state = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = (await privateAdmin
    .from('inventory_square_oauth_states' as never)
    .insert({
      created_by: userId,
      environment,
      expires_at: expiresAt,
      return_to: returnTo ?? null,
      state,
      ws_id: wsId,
    } as never)) as { error: SupabaseErrorLike };

  if (error) throw new Error(error.message ?? 'Failed to create OAuth state');

  return {
    authorizeUrl: createSquareAuthorizeUrl({ environment, origin, state }),
  };
}

export async function completeInventorySquareOAuthCallback({
  code,
  origin,
  state,
}: {
  code: string;
  origin: string;
  state: string;
}) {
  const privateAdmin = await getPrivateAdmin();
  const result = (await privateAdmin
    .from('inventory_square_oauth_states' as never)
    .select('state, ws_id, environment, created_by, return_to, expires_at')
    .eq('state', state)
    .is('consumed_at', null)
    .maybeSingle()) as {
    data: SquareOAuthStateRow | null;
    error: SupabaseErrorLike;
  };

  if (result.error) throw new Error(result.error.message ?? 'OAuth failed');
  if (!result.data) throw new Error('Square OAuth state is invalid');
  if (new Date(result.data.expires_at).getTime() < Date.now()) {
    throw new Error('Square OAuth state expired');
  }

  const token = await exchangeSquareOAuthCode({
    code,
    environment: result.data.environment,
    origin,
  });
  if (!token.access_token) throw new Error('Square OAuth returned no token');

  await upsertConnectionToken({
    accessToken: token.access_token,
    authMethod: 'oauth',
    environment: result.data.environment,
    expiresAt: token.expires_at ?? null,
    merchantId: token.merchant_id ?? null,
    refreshToken: token.refresh_token ?? null,
    scopes: parseSquareScopes(token.scope),
    userId: result.data.created_by,
    wsId: result.data.ws_id,
  });
  await upsertSettings({
    payload: { environment: result.data.environment },
    userId: result.data.created_by,
    wsId: result.data.ws_id,
  });
  await validateConnection({
    environment: result.data.environment,
    wsId: result.data.ws_id,
  });

  await privateAdmin
    .from('inventory_square_oauth_states' as never)
    .update({ consumed_at: new Date().toISOString() } as never)
    .eq('state', state);

  return {
    returnTo: result.data.return_to,
    wsId: result.data.ws_id,
  };
}
