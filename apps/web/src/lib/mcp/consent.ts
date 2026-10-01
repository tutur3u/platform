import { z } from 'zod';
import {
  McpAccessError,
  type McpAuthority,
  type McpConfig,
  type McpReads,
  scope,
  uuid,
} from './contracts';

const choiceSchema = z
  .object({
    workspace_ids: z.array(uuid).min(1).max(20),
    scopes: z.array(scope).min(1).max(3),
  })
  .strict();
const detailsSchema = z.object({
  authorization_id: z.string().min(1).max(512),
  redirect_uri: z.url(),
  client: z.object({ id: z.string().min(1).max(512) }),
  user: z.object({ id: uuid }),
  scope: z.string().max(1024),
});

export type ConsentBinding = {
  authorizationId: string;
  userId: string;
  clientId: string;
  resource: string;
  redirectUri: string;
  workspaceIds: string[];
  scopes: z.infer<typeof scope>[];
};

// Pure preparation, no provider approval or storage mutation. `details` must come
// from installed SDK getAuthorizationDetails(), not from browser/model input.
// `actor` comes from the existing account/MFA/CSRF boundary, never the choice body.
export async function prepareMcpConsent(
  config: McpConfig,
  choice: unknown,
  details: unknown,
  actor: {
    userId: string;
    accountAllowed: boolean;
    mfaAllowed: boolean;
    csrfVerified: boolean;
  },
  dependencies: {
    redirectUris: ReadonlyMap<string, ReadonlySet<string>>;
    reads: Pick<McpReads, 'workspaces'>;
    visibility: McpAuthority['workspaceVisibility'];
  }
): Promise<ConsentBinding> {
  const selected = choiceSchema.parse(choice);
  const provider = detailsSchema.safeParse(details);
  // An SDK redirect-only auto-consent response cannot establish domain consent.
  if (
    !provider.success ||
    !actor.accountAllowed ||
    !actor.mfaAllowed ||
    !actor.csrfVerified ||
    provider.data.user.id !== actor.userId ||
    !config.allowedClientIds.has(provider.data.client.id) ||
    !dependencies.redirectUris
      .get(provider.data.client.id)
      ?.has(provider.data.redirect_uri)
  ) {
    throw new McpAccessError(403, 'MCP consent is unavailable.');
  }
  const redirect = new URL(provider.data.redirect_uri);
  if (
    redirect.protocol !== 'https:' ||
    redirect.username ||
    redirect.password ||
    redirect.hash
  ) {
    throw new McpAccessError(403, 'MCP consent redirect is unavailable.');
  }
  // Provider OIDC scopes are separate from these application read permissions.
  if (
    provider.data.scope
      .split(/\s+/u)
      .filter(Boolean)
      .some((value) => !['openid', 'profile', 'email', 'phone'].includes(value))
  ) {
    throw new McpAccessError(403, 'Unsupported provider consent scope.');
  }
  const members = new Set(
    (await dependencies.reads.workspaces())
      .filter((row) => row.access_type === 'member')
      .map((row) => row.id)
  );
  const workspaceIds = [...new Set(selected.workspace_ids)];
  for (const workspaceId of workspaceIds) {
    if (
      !members.has(workspaceId) ||
      (await dependencies.visibility(actor.userId, workspaceId)) !== 'visible'
    ) {
      throw new McpAccessError(403, 'Workspace is unavailable.');
    }
  }
  return {
    authorizationId: provider.data.authorization_id,
    userId: actor.userId,
    clientId: provider.data.client.id,
    resource: config.resource,
    redirectUri: provider.data.redirect_uri,
    workspaceIds,
    scopes: [...new Set(selected.scopes)],
  };
}
