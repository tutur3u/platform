import { z } from 'zod';
import {
  GOOGLE_CALENDAR_SCOPE,
  type GoogleCalendarOAuthConfig,
} from './google-oauth-config';

const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const tokenSchema = z.object({
  access_token: z.string().trim().min(1),
  refresh_token: z.string().nullish(),
  expires_in: z.number().int().positive().max(2_147_483_647),
  token_type: z.literal('Bearer'),
  scope: z.string().optional(),
  id_token: z.string().optional(),
});

const errorSchema = z.object({
  error: z.enum([
    'access_denied',
    'deleted_client',
    'disabled_client',
    'invalid_client',
    'invalid_grant',
    'invalid_request',
    'invalid_scope',
    'redirect_uri_mismatch',
    'server_error',
    'temporarily_unavailable',
    'unauthorized_client',
    'unsupported_grant_type',
  ]),
});

export async function exchangeGoogleCalendarCode({
  clientId,
  clientSecret,
  code,
  codeVerifier,
  redirectUri,
}: GoogleCalendarOAuthConfig & {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}) {
  let response: Response;
  try {
    // Authorization codes are single-use. The caller must start a new flow after
    // any failed exchange, including when we cannot tell if Google received it.
    response = await globalThis.fetch(tokenEndpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
  } catch {
    return {
      ok: false,
      providerCode: 'transport_error',
      status: null,
    } as const;
  }

  // Decode Google's JSON explicitly, even if the transport mislabeled its type.
  let body: unknown = null;
  try {
    body = JSON.parse(await response.text());
  } catch {
    // Unreadable responses follow the bounded invalid-response path below.
  }
  const errorEnvelope =
    body !== null && typeof body === 'object' && 'error' in body;
  if (!response.ok || errorEnvelope) {
    const error = errorSchema.safeParse(body);
    return {
      ok: false,
      providerCode: error.success
        ? error.data.error
        : 'unrecognized_provider_error',
      status: response.status,
    } as const;
  }

  const parsed = tokenSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      providerCode: 'invalid_token_response',
      status: response.status,
    } as const;
  }

  const { expires_in, ...tokens } = parsed.data;
  if (!tokens.scope?.split(' ').includes(GOOGLE_CALENDAR_SCOPE)) {
    return {
      ok: false,
      providerCode: 'calendar_scope_missing',
      status: response.status,
    } as const;
  }

  return {
    ok: true,
    tokens: { ...tokens, expiry_date: Date.now() + expires_in * 1000 },
  } as const;
}
