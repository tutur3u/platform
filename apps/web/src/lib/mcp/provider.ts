import { McpAccessError, type McpAuthority } from './contracts';

// Structural installed auth-js 2.117.1 interface, limited to read-only calls.
// Construct with the public Supabase key and this request's user bearer only.
// Do not pass request/server wrappers that proxy protected tables via admin.
export interface McpProviderClient {
  auth: {
    getUser(token: string): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
    oauth: {
      listGrants(): Promise<{
        data: { client: { id: string } }[] | null;
        error: unknown;
      }>;
    };
  };
}

export type ProviderSessionPolicy = {
  userId: string;
  sessionId: string;
  sessionActive: boolean;
  accountAllowed: boolean;
  mfaAllowed: boolean;
};

export function createProviderSessionCheck(dependencies: {
  client(token: string): McpProviderClient;
  // Mandatory authoritative revocation/account/MFA lookup. getUser/JWKS alone
  // must not be treated as proof that an issued session remains active.
  policy(userId: string, sessionId: string): Promise<ProviderSessionPolicy>;
}): McpAuthority['revalidateProviderSession'] {
  return async (token, sessionId) => {
    const client = dependencies.client(token);
    const [identity, grants] = await Promise.all([
      client.auth.getUser(token),
      client.auth.oauth.listGrants(),
    ]);
    if (identity.error || grants.error || !identity.data.user || !grants.data) {
      throw new McpAccessError(
        401,
        'MCP provider authorization is unavailable.'
      );
    }
    const userId = identity.data.user.id;
    const state = await dependencies.policy(userId, sessionId);
    if (state.userId !== userId || state.sessionId !== sessionId) {
      throw new McpAccessError(401, 'MCP provider session is invalid.');
    }
    return {
      userId,
      clientIds: grants.data.map((grant) => grant.client.id),
      sessionActive: state.sessionActive,
      accountAllowed: state.accountAllowed,
      mfaAllowed: state.mfaAllowed,
    };
  };
}
