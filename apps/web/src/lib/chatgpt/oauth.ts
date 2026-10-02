import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import type { ChatGPTRegistration } from './storage';

export const OPENAI_ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const TOKEN_ENDPOINT = `${OPENAI_ISSUER}/api/accounts/oauth/token`;
const jwks = createRemoteJWKSet(
  new URL(`${OPENAI_ISSUER}/.well-known/jwks.json`)
);
const tokensSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().min(1).optional(),
  token_type: z.literal('Bearer'),
  expires_in: z.number().positive(),
  scope: z.string(),
});

export function createAuthorization(
  hostId: string,
  redirectUri: string,
  saved?: ChatGPTRegistration
) {
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const url = new URL(`${OPENAI_ISSUER}/api/accounts/authorize`);
  url.search = new URLSearchParams({
    client_id: saved?.clientId ?? 'dynamic_agent_client',
    ext_agent_host_id: hostId,
    ...(saved ? {} : { agent_name_hint: 'Tuturuuu' }),
    ...(saved?.idToken ? { id_token_hint: saved.idToken } : {}),
    response_type: 'code',
    redirect_uri: redirectUri,
    scope:
      'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
    resource: RESOURCE,
    state,
    nonce,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  }).toString();
  return { url, state, nonce, verifier, redirectUri, saved };
}

export function validateCallback(
  url: URL,
  attempt: ReturnType<typeof createAuthorization>
) {
  const state = url.searchParams.get('state') ?? '';
  if (
    state.length !== attempt.state.length ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(attempt.state))
  ) {
    throw new Error('Invalid OAuth state');
  }
  if (url.searchParams.has('error'))
    throw new Error('ChatGPT authorization was declined');
  const clientId = url.searchParams.get('client_id') ?? attempt.saved?.clientId;
  if (
    !clientId?.startsWith('oaiapp_') ||
    (attempt.saved && clientId !== attempt.saved.clientId)
  ) {
    throw new Error('Invalid ChatGPT client registration');
  }
  const code = url.searchParams.get('code');
  if (!code) throw new Error('Missing authorization code');
  return { code, clientId };
}

async function exchangeToken(parameters: Record<string, string>) {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...parameters, resource: RESOURCE }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error('ChatGPT token exchange failed; reconnect your account');
  return tokensSchema.parse(await response.json());
}

export async function completeAuthorization(
  url: URL,
  attempt: ReturnType<typeof createAuthorization>
) {
  const { code, clientId } = validateCallback(url, attempt);
  const tokens = await exchangeToken({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: attempt.verifier,
    redirect_uri: attempt.redirectUri,
  });
  if (!tokens.id_token || !tokens.refresh_token)
    throw new Error('ChatGPT registration is incomplete');
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: OPENAI_ISSUER,
    audience: clientId,
    requiredClaims: ['sub', 'exp', 'iat'],
    clockTolerance: 5,
  });
  if (
    payload.nonce !== attempt.nonce ||
    !payload.sub ||
    (attempt.saved && payload.sub !== attempt.saved.subject)
  ) {
    throw new Error('ChatGPT account identity did not match');
  }
  const scopes = tokens.scope.split(/\s+/);
  if (!scopes.includes('chatgpt.tokens.use.direct'))
    throw new Error('ChatGPT plan permission was not granted');
  return {
    clientId,
    subject: payload.sub,
    ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    scopes,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  } satisfies ChatGPTRegistration;
}

export async function refreshRegistration(registration: ChatGPTRegistration) {
  if (!registration.accessToken || !registration.refreshToken)
    throw new Error('Reconnect your ChatGPT account');
  if ((registration.expiresAt ?? 0) > Date.now() + 60_000) return;
  const tokens = await exchangeToken({
    grant_type: 'refresh_token',
    client_id: registration.clientId,
    refresh_token: registration.refreshToken,
  });
  const scopes = tokens.scope.split(/\s+/);
  if (!scopes.includes('chatgpt.tokens.use.direct'))
    throw new Error('ChatGPT plan permission is no longer available');
  Object.assign(registration, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? registration.refreshToken,
    idToken: tokens.id_token ?? registration.idToken,
    scopes,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  });
}

export async function revokeRegistration(registration: ChatGPTRegistration) {
  if (!registration.refreshToken) return true;
  try {
    const discovery = await fetch(
      `${OPENAI_ISSUER}/.well-known/openid-configuration`,
      { signal: AbortSignal.timeout(10_000) }
    );
    const { revocation_endpoint: endpoint } = await discovery.json();
    if (
      typeof endpoint !== 'string' ||
      new URL(endpoint).origin !== OPENAI_ISSUER
    )
      return false;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token: registration.refreshToken,
        token_type_hint: 'refresh_token',
        client_id: registration.clientId,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.status === 200;
  } catch {
    return false;
  }
}
