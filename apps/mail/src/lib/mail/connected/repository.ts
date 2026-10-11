import { getAdminClient } from '../repository/shared';
import type { MailRouteContext } from '../types';
import {
  ConnectedMailError,
  type MailProvider,
  providerConfig,
  scopes,
} from './config';
import { seal, unseal } from './crypto';

export type Credentials = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};
export type ConnectedAccount = {
  id: string;
  user_id: string;
  ws_id: string;
  provider: MailProvider;
  address: string;
  credentials: string;
  revision: number;
};
export async function table(
  name:
    | 'mail_connected_accounts'
    | 'mail_oauth_requests'
    | 'mail_connected_sends'
) {
  return (await getAdminClient()).schema('private').from(name as never) as any;
}
export async function listAccounts(ctx: MailRouteContext) {
  const { data, error } = await (await table('mail_connected_accounts'))
    .select('id,address,provider')
    .eq('user_id', ctx.user.id)
    .eq('ws_id', ctx.normalizedWsId);
  if (error) throw new Error('Failed to load connected accounts');
  return data ?? [];
}
export async function getAccount(
  ctx: MailRouteContext,
  id: string
): Promise<ConnectedAccount> {
  const { data, error } = await (await table('mail_connected_accounts'))
    .select('*')
    .eq('id', id)
    .eq('user_id', ctx.user.id)
    .eq('ws_id', ctx.normalizedWsId)
    .maybeSingle();
  if (error) throw new Error('Failed to load connected account');
  if (!data) throw new ConnectedMailError(404, 'Connected account not found');
  return data;
}
export async function exchangeToken(
  provider: MailProvider,
  values: Record<string, string>,
  previousRefresh?: string
): Promise<Credentials> {
  const config = providerConfig(provider);
  const response = await fetch(config.token, {
    method: 'POST',
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      ...values,
    }),
  });
  if (!response.ok)
    throw new ConnectedMailError(409, 'Reconnect this mail account');
  const token = await response.json();
  const refreshToken = token.refresh_token || previousRefresh;
  if (
    !token.access_token ||
    !refreshToken ||
    !Number.isFinite(token.expires_in)
  )
    throw new ConnectedMailError(
      409,
      'Mail consent did not provide offline access'
    );
  if (token.scope) {
    const granted = new Set(
      String(token.scope)
        .toLowerCase()
        .split(/\s+/u)
        .map((scope) =>
          provider === 'microsoft'
            ? scope.replace(/^https:\/\/graph\.microsoft\.com\//u, '')
            : scope
        )
    );
    const required = scopes[provider].filter(
      (scope) => scope !== 'offline_access'
    );
    if (required.some((scope) => !granted.has(scope.toLowerCase())))
      throw new ConnectedMailError(
        409,
        'Required mail permissions were not granted'
      );
  }
  return {
    accessToken: token.access_token,
    refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
}
type RefreshedCredentials = {
  token: string;
  encrypted: string;
  revision: number;
};
function refreshConflict() {
  return new ConnectedMailError(
    409,
    'Mail credentials changed; reload this account'
  );
}
async function winningRefresh(
  account: ConnectedAccount,
  previousToken: string,
  force: boolean
): Promise<RefreshedCredentials> {
  const { data, error } = await (await table('mail_connected_accounts'))
    .select('credentials,revision')
    .eq('id', account.id)
    .eq('user_id', account.user_id)
    .eq('ws_id', account.ws_id)
    .eq('provider', account.provider)
    .maybeSingle();
  if (
    error ||
    !data ||
    !Number.isInteger(data.revision) ||
    data.revision <= account.revision
  )
    throw refreshConflict();
  let winner: Credentials;
  try {
    winner = unseal<Credentials>(data.credentials, account.user_id);
  } catch {
    throw refreshConflict();
  }
  if (
    typeof winner?.accessToken !== 'string' ||
    !winner.accessToken ||
    typeof winner.refreshToken !== 'string' ||
    !winner.refreshToken ||
    !Number.isFinite(winner.expiresAt) ||
    winner.expiresAt <= Date.now() + 60000 ||
    (force && winner.accessToken === previousToken)
  )
    throw refreshConflict();
  return {
    token: winner.accessToken,
    encrypted: data.credentials,
    revision: data.revision,
  };
}
const refreshes = new Map<string, Promise<RefreshedCredentials>>();
function applyRefresh(
  account: ConnectedAccount,
  refreshed: RefreshedCredentials
) {
  account.credentials = refreshed.encrypted;
  account.revision = refreshed.revision;
  return refreshed.token;
}
export async function accessToken(account: ConnectedAccount, force = false) {
  const credentials = unseal<Credentials>(account.credentials, account.user_id);
  if (!force && credentials.expiresAt > Date.now() + 60000)
    return credentials.accessToken;
  const active = refreshes.get(account.id);
  if (active) return applyRefresh(account, await active);
  const pending = (async () => {
    const updated = await exchangeToken(
      account.provider,
      {
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
        ...(account.provider === 'microsoft'
          ? { scope: scopes.microsoft.join(' ') }
          : {}),
      },
      credentials.refreshToken
    );
    const encrypted = seal(updated, account.user_id);
    const revision = account.revision + 1;
    const { data, error } = await (await table('mail_connected_accounts'))
      .update({ credentials: encrypted, revision })
      .eq('id', account.id)
      .eq('user_id', account.user_id)
      .eq('revision', account.revision)
      .select('id')
      .maybeSingle();
    if (error) throw refreshConflict();
    if (!data) return winningRefresh(account, credentials.accessToken, force);
    return { token: updated.accessToken, encrypted, revision };
  })().finally(() => refreshes.delete(account.id));
  refreshes.set(account.id, pending);
  return applyRefresh(account, await pending);
}
