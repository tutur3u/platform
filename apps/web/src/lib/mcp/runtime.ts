import { createMcpJwtVerifier, type VerifyMcpJwt } from './authorization';
import type { McpAuthority, McpConfig } from './contracts';
import { createHostedMcpHandler, type McpTransport } from './http';
import { createMcpApiReads } from './internal-api';
import {
  createProviderSessionCheck,
  type ProviderSessionPolicy,
} from './provider';
import { createProviderReadClient } from './provider-client';
import { createMcpVisibilityReader } from './visibility';

// One composition root; no environment defaults, endpoint registration or live
// grant creation. The real official SDK transport must be supplied by the host.
export function createHostedReadWorkflow(
  config: McpConfig,
  dependencies: {
    publishableKey: string;
    grants: Pick<McpAuthority, 'readGrant'>;
    sessionPolicy(
      userId: string,
      sessionId: string
    ): Promise<ProviderSessionPolicy>;
    visibility?: McpAuthority['workspaceVisibility'];
    admission: McpAuthority['admit'];
    transport(): McpTransport;
    fetch?: typeof fetch;
    verify?: VerifyMcpJwt;
  }
) {
  const requestFetch = dependencies.fetch ?? fetch;
  const authority: McpAuthority = {
    readGrant: dependencies.grants.readGrant.bind(dependencies.grants),
    revalidateProviderSession: createProviderSessionCheck({
      client: (token) =>
        createProviderReadClient(
          config,
          dependencies.publishableKey,
          token,
          requestFetch
        ),
      policy: dependencies.sessionPolicy,
    }),
    workspaceVisibility: async () => 'unknown',
    admit: dependencies.admission,
  };
  return createHostedMcpHandler(config, {
    authority,
    verify: dependencies.verify ?? createMcpJwtVerifier(config),
    reads: (actor) => createMcpApiReads(actor, requestFetch),
    transport: dependencies.transport,
    readAuthority: (actor) => ({
      ...authority,
      workspaceVisibility:
        dependencies.visibility ??
        createMcpVisibilityReader(actor, requestFetch),
    }),
  });
}
