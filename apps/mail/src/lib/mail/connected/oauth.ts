import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { MailRouteContext } from '../types';
import {
  ConnectedMailError,
  type MailProvider,
  providerConfig,
  scopes,
} from './config';
import { seal, unseal } from './crypto';
import { exchangeToken, table } from './repository';

const cookieName = 'mail_oauth_state';
export const hashState = (state: string) =>
  createHash('sha256').update(state).digest('hex');
export function matchesState(state: string, cookie: string | undefined) {
  if (!cookie) return false;
  const expected = Buffer.from(state);
  const actual = Buffer.from(cookie);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export async function startOAuth(
  ctx: MailRouteContext,
  provider: MailProvider
) {
  const config = providerConfig(provider);
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const { error } = await (await table('mail_oauth_requests')).insert({
    state_hash: hashState(state),
    user_id: ctx.user.id,
    ws_id: ctx.normalizedWsId,
    provider,
    verifier: seal(verifier, ctx.user.id),
    expires_at: new Date(Date.now() + 600000).toISOString(),
  });
  if (error) throw new Error('Failed to start mail authorization');
  const url = new URL(config.authorize);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: scopes[provider].join(' '),
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    ...(provider === 'google'
      ? { access_type: 'offline', prompt: 'consent' }
      : { prompt: 'select_account' }),
  }).toString();
  const response = NextResponse.json({ authUrl: url.toString() });
  response.cookies.set(cookieName, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/mail/connected',
    maxAge: 600,
  });
  return response;
}

export async function finishOAuth(request: NextRequest, userId: string) {
  const state = request.nextUrl.searchParams.get('state') ?? '';
  if (
    !/^[A-Za-z0-9_-]{43}$/u.test(state) ||
    !matchesState(state, request.cookies.get(cookieName)?.value)
  )
    throw new ConnectedMailError(400, 'Invalid mail authorization state');
  const { data: pending, error } = await (await table('mail_oauth_requests'))
    .delete()
    .eq('state_hash', hashState(state))
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .select('*')
    .maybeSingle();
  if (error || !pending)
    throw new ConnectedMailError(
      400,
      'Mail authorization expired or already used'
    );
  if (request.nextUrl.searchParams.has('error'))
    throw new ConnectedMailError(409, 'Mail authorization was declined');
  const code = request.nextUrl.searchParams.get('code');
  if (!code || code.length > 8192)
    throw new ConnectedMailError(400, 'Missing authorization code');
  const admin = await import('../repository/shared').then((module) =>
    module.getAdminClient()
  );
  const { data: member, error: memberError } = await admin
    .from('workspace_members')
    .select('type')
    .eq('user_id', userId)
    .eq('ws_id', pending.ws_id)
    .maybeSingle();
  const { data: workspace, error: workspaceError } = await admin
    .from('workspaces')
    .select('personal')
    .eq('id', pending.ws_id)
    .maybeSingle();
  if (memberError || workspaceError || !member || !workspace?.personal)
    throw new ConnectedMailError(403, 'Personal workspace access required');
  const provider = pending.provider as MailProvider;
  const credentials = await exchangeToken(provider, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: providerConfig(provider).redirectUri,
    code_verifier: unseal<string>(pending.verifier, userId),
  });
  const endpoint =
    provider === 'google'
      ? 'https://gmail.googleapis.com/gmail/v1/users/me/profile'
      : 'https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName';
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${credentials.accessToken}` },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new ConnectedMailError(409, 'Unable to verify connected mailbox');
  const profile = await response.json();
  const address =
    provider === 'google'
      ? profile.emailAddress
      : profile.mail || profile.userPrincipalName;
  if (typeof address !== 'string' || !/^[^\s<>]+@[^\s<>]+$/u.test(address))
    throw new ConnectedMailError(
      409,
      'Provider did not return a mailbox address'
    );
  if (
    provider === 'microsoft' &&
    (typeof profile.id !== 'string' || !profile.id)
  )
    throw new ConnectedMailError(
      409,
      'Provider did not return a mailbox identity'
    );
  const { error: saveError } = await (
    await table('mail_connected_accounts')
  ).upsert(
    {
      user_id: userId,
      ws_id: pending.ws_id,
      provider,
      provider_account_id:
        provider === 'google' ? address.toLowerCase() : profile.id,
      address: address.toLowerCase(),
      credentials: seal(credentials, userId),
      revision: Date.now() % 2147483647,
    },
    { onConflict: 'user_id,ws_id,provider,provider_account_id' }
  );
  if (saveError) throw new Error('Failed to save connected mailbox');
  const result = NextResponse.redirect(
    new URL(`/${pending.ws_id}/inbox?connected=1`, request.url)
  );
  result.cookies.set(cookieName, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/v1/mail/connected',
    maxAge: 0,
  });
  return result;
}
