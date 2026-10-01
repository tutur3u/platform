import { createRemoteJWKSet, type JWTPayload, jwtVerify } from 'jose';
import { z } from 'zod';
import {
  grantSchema,
  McpAccessError,
  type McpActor,
  type McpAuthority,
  type McpConfig,
  type McpScope,
  uuid,
} from './contracts';

const oauthClaims = z.object({
  sub: uuid,
  iss: z.url(),
  aud: z.string(),
  role: z.literal('authenticated'),
  exp: z.number().int(),
  iat: z.number().int(),
  session_id: uuid,
  client_id: z.string().min(1).max(512),
  mcp_grant_id: uuid,
  mcp_grant_revision: z.number().int().positive(),
});
export type VerifyMcpJwt = (token: string) => Promise<JWTPayload>;

export function validateMcpConfig(config: McpConfig) {
  for (const value of [
    config.resource,
    config.metadataUrl,
    config.issuer,
    config.jwksUrl,
  ]) {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hash ||
      url.search
    ) {
      throw new McpAccessError(503, 'MCP configuration is unavailable.');
    }
  }
  if (
    new URL(config.jwksUrl).origin !== new URL(config.issuer).origin ||
    new URL(config.metadataUrl).origin !== new URL(config.resource).origin ||
    config.allowedClientIds.size === 0
  ) {
    throw new McpAccessError(503, 'MCP configuration is unavailable.');
  }
}

export function createMcpJwtVerifier(config: McpConfig): VerifyMcpJwt {
  validateMcpConfig(config);
  // jose implements cryptography. No token-controlled key/issuer URLs are used.
  const keys = createRemoteJWKSet(new URL(config.jwksUrl), {
    timeoutDuration: 5000,
  });
  return async (token) =>
    (
      await jwtVerify(token, keys, {
        issuer: config.issuer,
        audience: config.resource,
        algorithms: ['ES256', 'RS256'],
        requiredClaims: ['exp', 'iat', 'sub'],
      })
    ).payload;
}

export async function authorizeMcp(
  request: Request,
  config: McpConfig,
  authority: McpAuthority,
  verify: VerifyMcpJwt,
  now = Math.floor(Date.now() / 1000)
): Promise<McpActor> {
  validateMcpConfig(config);
  if (!config.securityReviewComplete)
    throw new McpAccessError(503, 'Hosted MCP is not enabled.');
  const match =
    /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/u.exec(
      request.headers.get('authorization') ?? ''
    );
  if (!match || match[1].length > 16384)
    throw new McpAccessError(401, 'MCP authorization is required.');
  const token = match[1];
  let claims: z.infer<typeof oauthClaims>;
  try {
    claims = oauthClaims.parse(await verify(token));
  } catch {
    throw new McpAccessError(401, 'MCP access token is invalid.');
  }
  if (
    claims.iss !== config.issuer ||
    claims.aud !== config.resource ||
    claims.exp <= now ||
    claims.iat > now ||
    !config.allowedClientIds.has(claims.client_id)
  ) {
    throw new McpAccessError(401, 'MCP access token is invalid.');
  }
  const [state, rawGrant] = await Promise.all([
    authority.revalidateProviderSession(token, claims.session_id),
    authority.readGrant(claims.sub, claims.client_id, claims.mcp_grant_id),
  ]);
  const parsed = grantSchema.safeParse(rawGrant);
  if (
    !state.sessionActive ||
    !state.accountAllowed ||
    !state.mfaAllowed ||
    state.userId !== claims.sub ||
    !state.clientIds.includes(claims.client_id) ||
    !parsed.success
  ) {
    throw new McpAccessError(401, 'MCP access has expired or been revoked.');
  }
  const grant = parsed.data;
  if (
    grant.revoked ||
    grant.expiresAt <= now ||
    grant.id !== claims.mcp_grant_id ||
    grant.userId !== claims.sub ||
    grant.clientId !== claims.client_id ||
    grant.resource !== config.resource ||
    grant.revision !== claims.mcp_grant_revision
  ) {
    throw new McpAccessError(401, 'MCP access has expired or been revoked.');
  }
  if (!(await authority.admit(claims.sub, claims.client_id)))
    throw new McpAccessError(429, 'MCP read limit reached.');
  return {
    userId: claims.sub,
    clientId: claims.client_id,
    sessionId: claims.session_id,
    tokenExpiresAt: claims.exp,
    grant,
    providerAccessToken: token,
  };
}

export async function revalidateMcpActor(
  actor: McpActor,
  authority: McpAuthority,
  required: McpScope
) {
  if (actor.tokenExpiresAt <= Math.floor(Date.now() / 1000))
    throw new McpAccessError(401, 'MCP access token has expired.');
  const parsed = grantSchema.safeParse(
    await authority.readGrant(actor.userId, actor.clientId, actor.grant.id)
  );
  const state = await authority.revalidateProviderSession(
    actor.providerAccessToken,
    actor.sessionId
  );
  if (
    !parsed.success ||
    parsed.data.revoked ||
    parsed.data.expiresAt <= Math.floor(Date.now() / 1000) ||
    parsed.data.id !== actor.grant.id ||
    parsed.data.userId !== actor.userId ||
    parsed.data.clientId !== actor.clientId ||
    parsed.data.resource !== actor.grant.resource ||
    parsed.data.revision !== actor.grant.revision ||
    !state.sessionActive ||
    !state.accountAllowed ||
    !state.mfaAllowed ||
    state.userId !== actor.userId ||
    !state.clientIds.includes(actor.clientId)
  )
    throw new McpAccessError(401, 'MCP access has expired or been revoked.');
  if (!parsed.data.scopes.includes(required))
    throw new McpAccessError(403, 'MCP scope is not granted.');
  return parsed.data;
}
